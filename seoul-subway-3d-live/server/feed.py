"""Seoul TOPIS realtimePosition adapter. Standard library only.
Source: https://data.seoul.go.kr/dataList/OA-12601/A/1/datasetView.do
Positions are station/status observations, NOT GPS coordinates.
"""
from __future__ import annotations

import json
import math
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, build_opener, HTTPRedirectHandler
import xml.etree.ElementTree as ET

KST = timezone(timedelta(hours=9))
UTC = timezone.utc
# Candidate route mappings. Successful responses determine availability; no coverage is invented.
FEEDS = {
    **{str(i): (f'{i}호선', f'100{i}') for i in range(1, 10)},
    '공항철도': ('공항철도', '1065'),
    '경의·중앙': ('경의중앙선', '1063'),
    '경춘': ('경춘선', '1067'),
    '수인·분당': ('수인분당선', '1075'),
    '신분당': ('신분당선', '1077'),
    '경강': ('경강선', '1081'),
    '서해': ('서해선', '1093'),
    'W': ('우이신설선', '1092'),
    'Silim': ('신림선', '1094'),
    'GTX-A': ('GTX-A', '1032'),
}
DOCUMENTATION = 'https://data.seoul.go.kr/dataList/OA-12601/A/1/datasetView.do'
PAGE_SIZE = 1000
# The realtimePosition specification does not define these codes. Pause on
# either one as a precaution; do not claim that Seoul identified a quota error.
PROVIDER_PAUSE_CODES = frozenset(('ERROR-337', 'ERROR-338'))


def iso(dt: datetime | None) -> str | None:
    return dt.astimezone(UTC).isoformat(timespec='seconds').replace('+00:00', 'Z') if dt else None


def observation_time(row: dict, now: datetime) -> datetime | None:
    """Parse provider timestamps in Seoul time, never silently stamp them 'now'."""
    raw = str(row.get('recptnDt') or '').strip()
    if not raw:
        return None
    try:
        # Full local datetime, or explicitly time-zoned ISO datetime.
        if re.match(r'^\d{4}-\d{2}-\d{2}[ T]', raw):
            dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
            return dt.replace(tzinfo=KST) if dt.tzinfo is None else dt
        if re.match(r'^\d{14}$', raw):
            return datetime.strptime(raw, '%Y%m%d%H%M%S').replace(tzinfo=KST)
        if re.match(r'^\d{2}:\d{2}:\d{2}(?:\.\d+)?$', raw):
            date_text = str(row.get('lastRecptnDt') or '').strip()
            date_digits = re.sub(r'\D', '', date_text)[:8]
            if len(date_digits) == 8:
                day = datetime.strptime(date_digits, '%Y%m%d').date()
                return datetime.fromisoformat(f'{day}T{raw}').replace(tzinfo=KST)
            # Time-only feeds: choose the most recent plausible occurrence, allowing 60 s skew.
            day = now.astimezone(KST).date()
            dt = datetime.fromisoformat(f'{day}T{raw}').replace(tzinfo=KST)
            if dt > now + timedelta(seconds=60):
                dt -= timedelta(days=1)
            return dt
    except (ValueError, TypeError):
        return None
    return None


class FeedError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # The credential is in the URL. Never send it to another redirect destination.
        return None


def parse_payload(raw: bytes) -> tuple[list[dict], int]:
    """Accept JSON, and XML errors returned by the provider even for a JSON request."""
    try:
        payload = json.loads(raw.decode('utf-8-sig'))
    except (UnicodeDecodeError, json.JSONDecodeError):
        try:
            root = ET.fromstring(raw)
            payload = {'code': root.findtext('.//code') or root.findtext('.//CODE'),
                       'message': root.findtext('.//message') or root.findtext('.//MESSAGE')}
            if not payload['code']:
                raise ValueError('No provider status')
        except (ET.ParseError, ValueError):
            raise FeedError('INVALID_RESPONSE', 'The upstream service did not return a recognizable API response.')
    if not isinstance(payload, dict):
        raise FeedError('INVALID_RESPONSE', 'Unexpected response type.')
    error = payload.get('errorMessage') or payload.get('RESULT') or payload
    if not isinstance(error, dict):
        error = {}
    code = str(error.get('code') or error.get('CODE') or '')
    if code == 'INFO-200':
        return [], 0
    if code and code not in ('INFO-000', '200'):
        safe_code = re.sub(r'[^A-Za-z0-9_-]', '', code)[:40] or 'UPSTREAM_ERROR'
        # Do not echo provider text: it may include the requested URL/API credential.
        messages = {
            'INFO-100': 'The API key was rejected. Check that it is approved for the realtime subway service.',
            'ERROR-300': 'The provider rejected the request parameters.',
            'ERROR-331': 'The provider rejected the pagination range.',
            'ERROR-337': 'The provider returned ERROR-337; its meaning for this feed is unconfirmed.',
            'ERROR-338': 'The provider returned ERROR-338; its meaning for this feed is unconfirmed.',
        }
        raise FeedError(safe_code, messages.get(safe_code, f'The upstream service returned {safe_code}. Check the official API documentation.'))
    rows = payload.get('realtimePositionList')
    if not isinstance(rows, list):
        raise FeedError('INVALID_RESPONSE', 'The response is missing realtimePositionList.')
    try:
        total = int(error['total'])
    except (KeyError, ValueError, TypeError):
        raise FeedError('INVALID_RESPONSE', 'The response is missing a valid reported total.')
    if total < 0:
        raise FeedError('INVALID_RESPONSE', 'The response contains an invalid reported total.')
    return rows, total


def normalize_rows(rows: list[dict], line_id: str, fetched: datetime) -> tuple[list[dict], int]:
    result: dict[str, dict] = {}
    skipped = 0
    expected = FEEDS[line_id][1]
    for row in rows:
        if not isinstance(row, dict):
            skipped += 1
            continue
        provider_id = str(row.get('subwayId') or '')
        number = str(row.get('trainNo') or '').strip()
        name = str(row.get('statnNm') or '').strip()
        if provider_id != expected or not number or not name:
            skipped += 1
            continue
        observed = observation_time(row, fetched)
        # Preserve unknown timestamps; the frontend excludes them from 'live' rendering.
        stamp = iso(observed)
        service_day = observed.astimezone(KST).strftime('%Y-%m-%d') if observed else 'unknown'
        key = f'{line_id}:{service_day}:{number}'
        item = {
            'key': key, 'lineId': line_id, 'providerLineId': provider_id,
            'number': number[:32], 'stationId': str(row.get('statnId') or '')[:40],
            'stationName': name[:100], 'observedAt': stamp, 'receivedAt': iso(fetched),
            'direction': str(row.get('updnLine') if row.get('updnLine') is not None else '')[:20],
            'status': str(row.get('trainSttus') if row.get('trainSttus') is not None else '')[:20],
            'destination': str(row.get('statnTnm') or '')[:100],
            'destinationId': str(row.get('statnTid') or '')[:40],
            'express': str(row.get('directAt') or '0') == '1',
            'lastTrain': str(row.get('lstcarAt') or '0') == '1',
        }
        old = result.get(key)
        if old is None or (stamp or '') > (old.get('observedAt') or ''):
            result[key] = item
    return list(result.values()), skipped


class DailyBudget:
    """Local protective cap, not a claim about the provider's assigned quota."""
    def __init__(self, path: Path, limit: int):
        self.path = path
        self.limit = limit
        self.lock = threading.Lock()
        self.day = ''
        self.used = 0
        try:
            saved = json.loads(path.read_text(encoding='utf-8'))
            self.day, self.used = str(saved['day']), int(saved['used'])
        except FileNotFoundError:
            pass
        except (OSError, ValueError, KeyError, TypeError):
            # Fail closed on a corrupt ledger rather than reset a consumed quota.
            self.day = datetime.now(KST).strftime('%Y-%m-%d')
            self.used = limit

    def _reset(self):
        day = datetime.now(KST).strftime('%Y-%m-%d')
        if day != self.day:
            self.day, self.used = day, 0

    def snapshot(self):
        with self.lock:
            self._reset()
            return {'dateKST': self.day, 'used': self.used, 'localLimit': self.limit,
                    'remaining': max(0, self.limit-self.used)}

    def reserve(self):
        with self.lock:
            self._reset()
            if self.used >= self.limit:
                raise FeedError('LOCAL_QUOTA_LIMIT', 'Local daily request cap reached. Adjust it only to match your approved provider quota.')
            self.used += 1
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temp = self.path.with_suffix('.tmp')
            try:
                temp.write_text(json.dumps({'day': self.day, 'used': self.used}), encoding='utf-8')
                os.chmod(temp, 0o600)
                temp.replace(self.path)
            except OSError:
                raise FeedError('BUDGET_STORAGE_ERROR', 'Cannot persist the local request budget. No upstream request was made.')


class FeedClient:
    def __init__(self, root: Path, env: dict | None = None, transport=None):
        env = env if env is not None else os.environ
        self.key = str(env.get('SEOUL_SUBWAY_API_KEY', '')).strip()
        self.configured = bool(self.key and self.key.lower() not in ('sample', 'paste_your_key_here', 'your_key_here'))
        self.poll_seconds = max(3, min(3600, int(env.get('SEOUL_POLL_SECONDS', '120'))))
        self.scheme = str(env.get('SEOUL_API_SCHEME', 'http')).lower()
        if self.scheme not in ('http', 'https'):
            raise ValueError('SEOUL_API_SCHEME must be http or https.')
        enabled = str(env.get('SEOUL_LIVE_LINES', '2'))
        self.enabled = list(FEEDS) if enabled == 'all' else [s.strip() for s in enabled.split(',') if s.strip() in FEEDS]
        self.budget = DailyBudget(root / '.runtime' / 'api-usage.json', max(1, int(env.get('SEOUL_DAILY_LIMIT', '900'))))
        self.cache: dict[str, dict] = {}
        self.locks = {line: threading.Lock() for line in FEEDS}
        self.opener = build_opener(NoRedirects())
        self.transport = transport or self._request
        self.auth_lock = threading.Lock()
        self.auth_error = False
        self.provider_quota_day = ''
        self.provider_quota_code = ''
        # Shared pool: multiple tabs cannot start independent unbounded upstream pools.
        self.pool = ThreadPoolExecutor(max_workers=3, thread_name_prefix='seoul-feed')

    def status(self):
        # This assumes every enabled route is requested continuously and each
        # snapshot fits in one page. Pagination can only increase the cost.
        daily_calls = len(self.enabled) * math.ceil(86400 / self.poll_seconds)
        quota_warning = None
        if daily_calls > self.budget.limit:
            quota_warning = (f'Continuous {self.poll_seconds}-second polling of {len(self.enabled)} enabled lines '
                             f'needs at least {daily_calls} upstream calls per KST day, before pagination; '
                             f'the local cap is {self.budget.limit}. Refreshes will stop at the cap.')
        return {'configured': self.configured, 'provider': 'Seoul TOPIS / realtimePosition',
                'sourceUrl': DOCUMENTATION, 'pollSeconds': self.poll_seconds,
                'freshSeconds': 90, 'expireSeconds': 300, 'enabledLines': self.enabled,
                'supportedLines': list(FEEDS), 'budget': self.budget.snapshot(),
                'continuousDailyCallsMinimum': daily_calls, 'quotaWarning': quota_warning,
                'upstreamTransport': self.scheme, 'serverTime': iso(datetime.now(UTC))}

    def _request(self, url: str) -> bytes:
        req = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'SeoulSubsurface/2.0 (personal transit visualization)'})
        with self.opener.open(req, timeout=10) as response:
            data = response.read(4_000_001)
            if len(data) > 4_000_000:
                raise FeedError('RESPONSE_TOO_LARGE', 'The provider response exceeded the safety limit.')
            return data

    def line(self, line_id: str) -> dict:
        if line_id not in self.enabled:
            return {'lineId': line_id, 'state': 'disabled', 'trains': [], 'message': 'This feed is not enabled on the server.'}
        if not self.configured:
            return {'lineId': line_id, 'state': 'unconfigured', 'trains': [], 'message': 'Set SEOUL_SUBWAY_API_KEY in .env and restart the server.'}
        with self.locks[line_id]:
            now = time.time()
            old = self.cache.get(line_id)
            if old and now < old['nextAttempt']:
                return {k: v for k, v in old.items() if k != 'nextAttempt'}
            fetched = datetime.now(UTC)
            error = None
            rows = []
            try:
                # Fixed destination and named route allowlist; no client-controlled proxy URL.
                name = quote(FEEDS[line_id][0], safe='')
                start = 0
                expected_total = None
                previous_page = None
                while True:
                    # Recheck between pages: another line may have encountered the
                    # provider-wide quota or key error during this snapshot.
                    with self.auth_lock:
                        if self.auth_error:
                            raise FeedError('INFO-100', 'The API key was rejected. Correct .env and restart the server.')
                        if self.provider_quota_day == datetime.now(KST).strftime('%Y-%m-%d'):
                            code = self.provider_quota_code or 'ERROR-337'
                            raise FeedError(code, f'The provider returned {code}; its meaning for this feed is unconfirmed.')
                    self.budget.reserve()
                    url = f'{self.scheme}://swopenapi.seoul.go.kr/api/subway/{quote(self.key, safe="")}/json/realtimePosition/{start}/{start+PAGE_SIZE}/{name}'
                    page, reported_total = parse_payload(self.transport(url))
                    expected_total = max(expected_total or 0, reported_total)
                    if not page and expected_total > len(rows):
                        raise FeedError('INCOMPLETE_SNAPSHOT', 'The provider stopped before all reported records were received.')
                    if previous_page is not None and page == previous_page:
                        raise FeedError('INCOMPLETE_SNAPSHOT', 'The provider repeated a page before all reported records were received.')
                    if len(page) > PAGE_SIZE + 1:
                        raise FeedError('INCOMPLETE_SNAPSHOT', 'The provider returned more records than the requested page range.')
                    rows.extend(page)
                    if len(rows) >= expected_total:
                        break
                    if len(page) < PAGE_SIZE:
                        raise FeedError('INCOMPLETE_SNAPSHOT', 'The provider returned fewer records than its reported total.')
                    previous_page = page
                    # The documented range begins at 0; advance by records actually
                    # returned so either inclusive or exclusive end bounds remain covered.
                    start += len(page)
                trains, skipped = normalize_rows(rows, line_id, fetched)
                item = {'lineId': line_id, 'state': 'ok' if trains else 'empty',
                        'trains': trains, 'fetchedAt': iso(fetched), 'lastAttemptAt': iso(fetched),
                        'rawCount': len(rows), 'skippedRecords': skipped,
                        'truncated': False, 'message': ''}
            except FeedError as exc:
                error = exc
            except HTTPError as exc:
                error = FeedError(f'HTTP_{exc.code}', 'The upstream request failed. Verify the API key, service approval, and configured HTTP/HTTPS transport.')
            except (URLError, TimeoutError, OSError):
                error = FeedError('NETWORK_ERROR', 'Cannot reach Seoul’s data service. Check internet access and SEOUL_API_SCHEME; the documented endpoint uses HTTP.')
            except Exception:
                # No traceback/URL/API key is returned or printed for network errors.
                error = FeedError('UNEXPECTED_RESPONSE', 'Unable to process the upstream response.')
            if error:
                with self.auth_lock:
                    if error.code == 'INFO-100':
                        self.auth_error = True
                    if error.code in PROVIDER_PAUSE_CODES:
                        self.provider_quota_day = datetime.now(KST).strftime('%Y-%m-%d')
                        self.provider_quota_code = error.code
                if error.code in PROVIDER_PAUSE_CODES:
                    error.message += ' Further calls are paused through this local KST day as a precaution.'
                item = {'lineId': line_id, 'state': 'error', 'code': error.code, 'message': error.message,
                        'trains': (old or {}).get('trains', []), 'fetchedAt': (old or {}).get('fetchedAt'),
                        'lastAttemptAt': iso(fetched)}
            # A failed response never refreshes observation timestamps.
            item['nextAttempt'] = time.time() + (max(60, self.poll_seconds) if error else self.poll_seconds)
            self.cache[line_id] = item
            return {k: v for k, v in item.items() if k != 'nextAttempt'}

    def positions(self, requested: list[str]) -> dict:
        chosen = list(dict.fromkeys(s for s in requested if s in FEEDS))[:len(FEEDS)]
        results = list(self.pool.map(self.line, chosen)) if self.configured else [self.line(i) for i in chosen]
        return {**self.status(), 'lines': results}
