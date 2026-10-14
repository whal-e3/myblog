#!/usr/bin/env python3
"""Build an aggregate train-count profile without publishing train identifiers.

Offline seed: python tools/collect_train_profile.py --import-survey SURVEY.json
One local sample: python tools/collect_train_profile.py --collect

The second command is deliberately opt-in and contacts only the existing local
backend. That backend owns the Seoul credential, cache, pagination, and KST
quota ledger. This script has no polling loop or direct provider client.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.feed import DOCUMENTATION, FEEDS, KST, NoRedirects, normalize_rows  # noqa: E402

SCHEMA = 'seoul-train-count-profile/v1'
ROUTES = tuple(FEEDS)
FRESH_SECONDS = 90
EXPIRE_SECONDS = 300
MAX_LOCAL_CAP = 900  # No higher allowance has been verified for this key.
DEFAULT_OUTPUT = ROOT / 'data' / 'train-density-profile.json'


class ProfileError(Exception):
    pass


def timestamp(value: str) -> datetime:
    if not isinstance(value, str):
        raise ProfileError('A sample timestamp is missing.')
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as exc:
        raise ProfileError('A sample timestamp is invalid.') from exc
    if result.tzinfo is None:
        raise ProfileError('A sample timestamp lacks a time zone.')
    return result


def bucket(at: datetime) -> dict:
    local = at.astimezone(KST)
    return {'dayType': 'weekend' if local.weekday() >= 5 else 'weekday',
            'hour': local.hour, 'quarter': local.minute // 15}


def quality_counts(trains: list, at: datetime) -> tuple[int, int, int]:
    visible = fresh = stale = 0
    for train in trains:
        raw = train.get('observedAt') if isinstance(train, dict) else None
        if not raw:
            continue
        try:
            age = (at - timestamp(raw)).total_seconds()
        except ProfileError:
            continue
        if -60 <= age <= EXPIRE_SECONDS:
            visible += 1
            if age <= FRESH_SECONDS:
                fresh += 1
            else:
                stale += 1
    return visible, fresh, stale


def aggregate_line(line: dict, at: datetime) -> dict:
    reported = line.get('rawCount')
    if isinstance(reported, bool) or not isinstance(reported, int) or reported < 0:
        raise ProfileError('A route has no valid full-result count.')
    trains = line.get('trains')
    if not isinstance(trains, list):
        raise ProfileError('A route is missing its normalized reports.')
    visible, fresh, stale = quality_counts(trains, at)
    return {'reported': reported, 'visible': visible, 'fresh': fresh, 'stale': stale}


def empty_profile() -> dict:
    return {
        'schema': SCHEMA,
        'source': {'provider': 'Seoul Metropolitan Government / TOPIS',
                   'dataset': 'realtimePosition', 'url': DOCUMENTATION,
                   'countUnit': 'Deduplicated, timestamped station-level train reports',
                   'locationType': 'Station reports; not GPS coordinates or a timetable'},
        'coverage': {'routes': len(ROUTES), 'timeBucketsObserved': 0,
                     'typicalCoverage': False,
                     'note': 'Counts are samples of provider-reported trains, not all operating trains. '
                             'A sparse profile cannot establish typical service frequency or train movements.'},
        'samples': [],
    }


def survey_sample(document: dict) -> dict:
    """Reduce a previously captured survey to counts; never copy its rows."""
    if not isinstance(document, dict) or not isinstance(document.get('routes'), list):
        raise ProfileError('The survey has no route list.')
    raw_routes = {r.get('route'): r for r in document['routes'] if isinstance(r, dict)}
    if set(raw_routes) != set(ROUTES) or len(document['routes']) != len(ROUTES):
        raise ProfileError('The survey does not contain exactly the 19 confirmed routes.')
    start = timestamp(document.get('startedAt'))
    end = timestamp(document.get('completedAt'))
    if end < start or end - start > timedelta(minutes=5):
        raise ProfileError('The survey is not a bounded all-route snapshot.')
    counts = {}
    for route_id in ROUTES:
        route = raw_routes[route_id]
        rows = route.get('rows')
        if (route.get('state') != 'records' or route.get('fullReportedDataset') is not True
                or not isinstance(rows, list) or route.get('returnedCount') != len(rows)
                or route.get('reportedTotal') != len(rows)):
            raise ProfileError('The survey contains a failed or partial route.')
        fetched = timestamp(route.get('completedAt'))
        trains, skipped = normalize_rows(rows, route_id, fetched)
        if skipped or route.get('normalizedCount') != len(trains):
            raise ProfileError('The survey normalization does not match the current adapter.')
        counts[route_id] = aggregate_line({'rawCount': len(rows), 'trains': trains}, fetched)
    # The hash identifies this sampled window, not any individual train.
    key = hashlib.sha256(f'survey:{start.isoformat()}:{end.isoformat()}'.encode()).hexdigest()[:24]
    return {'sampledAtKST': end.astimezone(KST).isoformat(timespec='seconds'),
            'bucketKST': bucket(end), 'snapshotKey': key,
            'evidence': {'kind': 'one_off_provider_survey', 'routeCount': len(ROUTES),
                         'windowStartKST': start.astimezone(KST).isoformat(timespec='seconds'),
                         'windowEndKST': end.astimezone(KST).isoformat(timespec='seconds'),
                         'note': 'One complete provider-reported snapshot, not an all-day frequency profile.'},
            'routes': counts}


def local_base_url(raw: str) -> str:
    parsed = urlsplit(raw)
    try:
        port = parsed.port
    except ValueError as exc:
        raise ProfileError('The local backend port is invalid.') from exc
    if (parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost')
            or not port or parsed.username or parsed.password or parsed.path not in ('', '/')
            or parsed.query or parsed.fragment):
        raise ProfileError('The backend must be a plain http://127.0.0.1:PORT or localhost URL.')
    return f'http://{parsed.hostname}:{port}'


def get_local_json(base: str, path: str) -> dict:
    try:
        # A local server must not redirect this manual request to the internet.
        with build_opener(NoRedirects()).open(Request(base + path, headers={'Accept': 'application/json'}), timeout=90) as response:
            if response.status != 200:
                raise ProfileError('The local backend did not return success.')
            raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise ProfileError('The local backend response is too large.')
            result = json.loads(raw)
    except (OSError, ValueError) as exc:
        # Do not print request URLs or upstream provider messages.
        raise ProfileError('Could not read the local backend. Check that it is running.') from exc
    if not isinstance(result, dict):
        raise ProfileError('The local backend returned an unexpected response.')
    return result


def validate_status(status: dict) -> None:
    if status.get('configured') is not True:
        raise ProfileError('The local backend has no configured provider key.')
    if set(status.get('enabledLines') or ()) != set(ROUTES):
        raise ProfileError('The local backend must explicitly enable all 19 confirmed routes.')
    budget = status.get('budget') or {}
    limit, remaining = budget.get('localLimit'), budget.get('remaining')
    if (isinstance(limit, bool) or not isinstance(limit, int) or limit > MAX_LOCAL_CAP
            or isinstance(remaining, bool) or not isinstance(remaining, int)
            or remaining < len(ROUTES)):
        raise ProfileError('The local KST budget lacks room for a full sweep or exceeds the verified cap.')


def live_sample(status: dict, response: dict) -> dict:
    validate_status(status)
    if response.get('configured') is not True:
        raise ProfileError('The backend feed became unconfigured.')
    at = timestamp(response.get('serverTime'))
    raw_lines = response.get('lines')
    if not isinstance(raw_lines, list):
        raise ProfileError('The backend did not return its route list.')
    lines = {line.get('lineId'): line for line in raw_lines if isinstance(line, dict)}
    if set(lines) != set(ROUTES) or len(raw_lines) != len(ROUTES):
        raise ProfileError('The backend did not return exactly 19 routes.')
    counts = {}
    fetched_times = []
    for route_id in ROUTES:
        line = lines[route_id]
        if line.get('state') not in ('ok', 'empty') or line.get('truncated') is not False:
            raise ProfileError('A route failed or returned an incomplete snapshot; no sample was saved.')
        fetched = timestamp(line.get('fetchedAt'))
        if not 0 <= (at - fetched).total_seconds() <= 150:
            raise ProfileError('A route is too old for an aggregate time bucket; no sample was saved.')
        fetched_times.append(fetched)
        counts[route_id] = aggregate_line(line, at)
    if max(fetched_times) - min(fetched_times) > timedelta(seconds=150):
        raise ProfileError('The route fetches span too much time for one sample.')
    # This permits a manual command to run again without duplicating cached data.
    signature = '|'.join(f'{route_id}:{lines[route_id]["fetchedAt"]}' for route_id in ROUTES)
    key = hashlib.sha256(signature.encode()).hexdigest()[:24]
    return {'sampledAtKST': at.astimezone(KST).isoformat(timespec='seconds'),
            'bucketKST': bucket(at), 'snapshotKey': key,
            'evidence': {'kind': 'manual_local_backend_sample', 'routeCount': len(ROUTES),
                         'windowStartKST': min(fetched_times).astimezone(KST).isoformat(timespec='seconds'),
                         'windowEndKST': max(fetched_times).astimezone(KST).isoformat(timespec='seconds'),
                         'note': 'Provider-reported station snapshots. The local backend controls cache and quota.'},
            'routes': counts}


def collect_once(base: str, get_json=get_local_json) -> dict:
    base = local_base_url(base)
    status = get_json(base, '/api/live/status')
    validate_status(status)  # No positions call if key, route set, or budget is wrong.
    query = urlencode({'lines': ','.join(ROUTES)})
    response = get_json(base, '/api/live/positions?' + query)
    return live_sample(status, response)


def public_profile(profile: dict) -> dict:
    """Rebuild the browser payload from count/time allowlists only."""
    if not isinstance(profile, dict) or profile.get('schema') != SCHEMA or not isinstance(profile.get('samples'), list):
        raise ProfileError('The aggregate profile uses an unexpected schema.')
    result = empty_profile()
    for sample in profile['samples']:
        if not isinstance(sample, dict) or set(sample.get('routes') or {}) != set(ROUTES):
            raise ProfileError('A sample does not contain exactly 19 routes.')
        at = timestamp(sample.get('sampledAtKST'))
        key = sample.get('snapshotKey')
        if not isinstance(key, str) or not re.fullmatch(r'[0-9a-f]{24}', key):
            raise ProfileError('A sample has an invalid aggregate snapshot key.')
        evidence = sample.get('evidence') or {}
        kind = evidence.get('kind')
        if kind not in ('one_off_provider_survey', 'manual_local_backend_sample'):
            raise ProfileError('A sample has an unknown evidence type.')
        start = timestamp(evidence.get('windowStartKST'))
        end = timestamp(evidence.get('windowEndKST'))
        if end < start:
            raise ProfileError('A sample evidence window is invalid.')
        counts = {}
        for route in ROUTES:
            row = sample['routes'][route]
            if not isinstance(row, dict):
                raise ProfileError('A route has invalid aggregate counts.')
            values = {name: row.get(name) for name in ('reported', 'visible', 'fresh', 'stale')}
            if (any(isinstance(v, bool) or not isinstance(v, int) or v < 0 for v in values.values())
                    or values['fresh'] + values['stale'] != values['visible']
                    or values['visible'] > values['reported']):
                raise ProfileError('A route has inconsistent aggregate counts.')
            counts[route] = values
        result['samples'].append({
            'sampledAtKST': at.astimezone(KST).isoformat(timespec='seconds'),
            'bucketKST': bucket(at), 'snapshotKey': key,
            'evidence': {'kind': kind, 'routeCount': len(ROUTES),
                         'windowStartKST': start.astimezone(KST).isoformat(timespec='seconds'),
                         'windowEndKST': end.astimezone(KST).isoformat(timespec='seconds'),
                         'note': ('One complete provider-reported snapshot, not an all-day frequency profile.'
                                  if kind == 'one_off_provider_survey' else
                                  'Provider-reported station snapshots. The local backend controls cache and quota.')},
            'routes': counts,
        })
    result['samples'].sort(key=lambda s: s['sampledAtKST'])
    result['coverage']['timeBucketsObserved'] = len({
        (s['sampledAtKST'][:10], s['bucketKST']['hour'], s['bucketKST']['quarter'])
        for s in result['samples']})
    return result


def write_browser_js(profile: dict, path: Path) -> None:
    safe = public_profile(profile)
    contents = 'window.SEOUL_TRAIN_PROFILE = ' + json.dumps(
        safe, ensure_ascii=True, sort_keys=True, separators=(',', ':')) + ';\n'
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp')
    try:
        temp.write_text(contents, encoding='utf-8')
        os.replace(temp, path)
    except OSError as exc:
        raise ProfileError('Cannot write the browser aggregate profile.') from exc


def save_sample(path: Path, sample: dict) -> bool:
    try:
        profile = json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:
        profile = empty_profile()
    except (OSError, ValueError) as exc:
        raise ProfileError('Cannot read the existing aggregate profile.') from exc
    if not isinstance(profile, dict) or profile.get('schema') != SCHEMA or not isinstance(profile.get('samples'), list):
        raise ProfileError('The existing profile uses an unexpected schema.')
    if any(s.get('snapshotKey') == sample['snapshotKey'] for s in profile['samples']):
        write_browser_js(profile, path.with_suffix('.js'))
        return False
    profile['samples'].append(sample)
    profile['samples'].sort(key=lambda s: s['sampledAtKST'])
    profile = public_profile(profile)
    # 'typicalCoverage' remains false until a human assesses multiple days.
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp')
    try:
        temp.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        os.replace(temp, path)
    except OSError as exc:
        raise ProfileError('Cannot write the aggregate profile.') from exc
    write_browser_js(profile, path.with_suffix('.js'))
    return True


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--import-survey', type=Path, metavar='SURVEY_JSON',
                      help='Offline: reduce an existing all-route survey to counts.')
    mode.add_argument('--collect', action='store_true',
                      help='Explicitly sample once through the running local backend.')
    mode.add_argument('--build-js', action='store_true',
                      help='Offline: regenerate the browser JS from aggregate JSON.')
    parser.add_argument('--server', default='http://127.0.0.1:8787',
                        help='Local backend for --collect; loopback HTTP only.')
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(argv)
    try:
        if args.build_js:
            write_browser_js(json.loads(args.output.read_text(encoding='utf-8')), args.output.with_suffix('.js'))
            print('Regenerated the aggregate browser profile without a network request.')
            return 0
        if args.import_survey:
            document = json.loads(args.import_survey.read_text(encoding='utf-8'))
            sample = survey_sample(document)
        else:
            sample = collect_once(args.server)
        added = save_sample(args.output, sample)
    except (ProfileError, OSError, ValueError) as exc:
        parser.exit(1, f'Profile collection stopped: {exc}\n')
    print(('Added' if added else 'Already stored') + f' aggregate sample for {sample["sampledAtKST"]}.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
