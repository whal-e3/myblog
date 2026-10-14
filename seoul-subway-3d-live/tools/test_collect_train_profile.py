"""Offline tests for the opt-in aggregate profile collector."""
from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import collect_train_profile as profile


NOW = datetime(2026, 10, 14, 16, 31, 48, tzinfo=profile.KST)


def stamp(seconds_ago: int) -> str:
    return (NOW - timedelta(seconds=seconds_ago)).isoformat()


def status(enabled=None, remaining=900, limit=900):
    return {'configured': True, 'enabledLines': list(profile.ROUTES) if enabled is None else enabled,
            'budget': {'localLimit': limit, 'remaining': remaining}}


def backend_response():
    return {'configured': True, 'serverTime': NOW.isoformat(),
            'lines': [{'lineId': route, 'state': 'ok', 'truncated': False,
                       'rawCount': 3, 'fetchedAt': stamp(10),
                       'trains': [{'number': 'PRIVATE-TRAIN-ID', 'observedAt': stamp(30)},
                                  {'number': 'ALSO-PRIVATE', 'observedAt': stamp(180)},
                                  {'number': 'EXPIRED-PRIVATE', 'observedAt': stamp(301)}]}
                      for route in profile.ROUTES]}


class ProfileCollectorTests(unittest.TestCase):
    def test_local_sample_has_19_aggregate_counts_and_no_train_ids(self):
        sample = profile.live_sample(status(), backend_response())
        self.assertEqual(set(sample['routes']), set(profile.ROUTES))
        self.assertEqual(sample['routes']['2'], {'reported': 3, 'visible': 2, 'fresh': 1, 'stale': 1})
        self.assertEqual(sample['bucketKST'], {'dayType': 'weekday', 'hour': 16, 'quarter': 2})
        self.assertNotIn('PRIVATE-TRAIN-ID', json.dumps(sample))
        self.assertNotIn('stationName', json.dumps(sample))

    def test_preflight_rejects_insufficient_or_unverified_budget_before_positions(self):
        for bad in (status(enabled=['2']), status(remaining=18), status(limit=1000)):
            calls = []
            def fake_get(base, path):
                calls.append(path)
                return bad
            with self.assertRaises(profile.ProfileError):
                profile.collect_once('http://127.0.0.1:8787', fake_get)
            self.assertEqual(calls, ['/api/live/status'])

    def test_non_loopback_server_is_never_contacted(self):
        for url in ('https://127.0.0.1:8787', 'http://example.com:8787',
                    'http://user:pass@localhost:8787', 'http://localhost:8787/evil'):
            with self.assertRaises(profile.ProfileError):
                profile.collect_once(url, lambda *_: self.fail('Unexpected HTTP call'))

    def test_failed_or_old_route_never_becomes_a_sample(self):
        response = backend_response()
        response['lines'][0]['state'] = 'error'
        with self.assertRaises(profile.ProfileError):
            profile.live_sample(status(), response)
        response = backend_response()
        response['lines'][0]['fetchedAt'] = stamp(151)
        with self.assertRaises(profile.ProfileError):
            profile.live_sample(status(), response)

    def test_manual_collection_uses_only_local_status_and_positions(self):
        calls = []
        responses = [status(), backend_response()]
        def fake_get(base, path):
            self.assertEqual(base, 'http://localhost:8787')
            calls.append(path)
            return responses.pop(0)
        sample = profile.collect_once('http://localhost:8787', fake_get)
        self.assertEqual(sample['routes']['GTX-A']['fresh'], 1)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0], '/api/live/status')
        self.assertTrue(calls[1].startswith('/api/live/positions?lines='))

    def test_survey_import_deduplicates_without_copying_raw_rows(self):
        routes = []
        for route, (_, provider_id) in profile.FEEDS.items():
            row = {'subwayId': provider_id, 'trainNo': 'SECRET-TRAIN', 'statnNm': 'PRIVATE-STATION',
                   'recptnDt': '2026-10-14 16:31:30'}
            routes.append({'route': route, 'state': 'records', 'fullReportedDataset': True,
                           'returnedCount': 2, 'reportedTotal': 2, 'normalizedCount': 1,
                           'completedAt': NOW.isoformat(), 'rows': [row, row]})
        document = {'startedAt': stamp(3), 'completedAt': NOW.isoformat(), 'routes': routes}
        sample = profile.survey_sample(document)
        self.assertEqual(sample['routes']['1'], {'reported': 2, 'visible': 1, 'fresh': 1, 'stale': 0})
        self.assertNotIn('SECRET-TRAIN', json.dumps(sample))
        self.assertNotIn('PRIVATE-STATION', json.dumps(sample))
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'counts.json'
            self.assertTrue(profile.save_sample(output, sample))
            browser = output.with_suffix('.js').read_text(encoding='utf-8')
            self.assertFalse(profile.save_sample(output, sample))
            saved = output.read_text(encoding='utf-8')
            self.assertNotIn('SECRET-TRAIN', saved)
            self.assertNotIn('SECRET-TRAIN', browser)
            self.assertNotIn('PRIVATE-STATION', browser)
            self.assertEqual(browser, output.with_suffix('.js').read_text(encoding='utf-8'))
            self.assertEqual(json.loads(browser.removeprefix('window.SEOUL_TRAIN_PROFILE = ').removesuffix(';\n')),
                             json.loads(saved))
            self.assertFalse(json.loads(saved)['coverage']['typicalCoverage'])
            self.assertEqual(len(json.loads(saved)['samples']), 1)

    def test_browser_payload_allowlist_drops_unexpected_raw_fields(self):
        sample = profile.live_sample(status(), backend_response())
        sample['routes']['2']['trainNo'] = 'PRIVATE-TRAIN-ID'
        sample['privateRows'] = [{'stationName': 'PRIVATE-STATION'}]
        clean = profile.public_profile({'schema': profile.SCHEMA, 'samples': [sample]})
        self.assertNotIn('PRIVATE-TRAIN-ID', json.dumps(clean))
        self.assertNotIn('PRIVATE-STATION', json.dumps(clean))


if __name__ == '__main__':
    unittest.main()
