import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import release_observations as ledger

OLD, NEW = 'a' * 40, 'b' * 40


class Client:
    def __init__(self):
        self.reply = {'status': 'ahead', 'base_commit': {'sha': OLD}, 'total_commits': 1,
                      'commits': [{'sha': NEW, 'commit': {'committer': {'date': '2020-01-01T00:00:00Z'}}}]}
        self.calls = []

    def gh(self, path):
        self.calls.append(path)
        return self.reply


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'delivery' / 'releases.json'
        self.client = Client()
        self.assertTrue(ledger.init(self.path))

    def data(self):
        return json.loads(self.path.read_text())

    def test_initializer_has_no_history_and_replay_is_idempotent(self):
        self.assertEqual(self.data()['deployments'], [])
        self.assertFalse(ledger.init(self.path))
        ledger.mark_pending(self.path)
        self.assertTrue(ledger.record(self.path, self.client, 'dep_new', NEW, OLD))
        original = self.data()['deployments'][0]
        self.assertEqual(original['classification'], 'unknown')
        self.assertTrue(original['commitCoverageComplete'])
        self.assertFalse(ledger.record(self.path, self.client, 'dep_new', NEW, OLD))
        self.assertEqual(self.data()['deployments'], [original])
        self.assertEqual(self.client.calls, ['/compare/' + OLD + '...' + NEW])

    def test_incomplete_or_over_250_compare_keeps_lead_time_unknown(self):
        self.client.reply['total_commits'] = 251
        ledger.mark_pending(self.path)
        ledger.record(self.path, self.client, 'dep_new', NEW, OLD)
        row = self.data()['deployments'][0]
        self.assertEqual(row['commits'], [])
        self.assertFalse(row['commitCoverageComplete'])

    def test_malformed_ledger_and_conflicting_replay_fail_closed(self):
        ledger.mark_pending(self.path)
        ledger.record(self.path, self.client, 'dep_new', NEW, OLD)
        with self.assertRaises(ledger.ObservationError):
            ledger.record(self.path, self.client, 'dep_new', OLD, OLD)
        content = self.data()
        content['deployments'].append(content['deployments'][0])
        self.path.write_text(json.dumps(content))
        with self.assertRaises(ledger.ObservationError):
            ledger.mark_pending(self.path)

    def test_classification_requires_incident_evidence(self):
        ledger.mark_pending(self.path)
        ledger.record(self.path, self.client, 'dep_new', NEW, OLD)
        with self.assertRaises(ledger.ObservationError):
            ledger.classify(self.path, 'dep_new', 'failed')
        self.assertEqual(self.data()['deployments'][0]['classification'], 'unknown')
        self.assertTrue(ledger.classify(self.path, 'dep_new', 'failed', ledger.now_utc()))
        self.assertEqual(self.data()['deployments'][0]['classification'], 'failed')

    def test_full_ledger_refuses_admission_without_changing_ready_file(self):
        data = self.data()
        data['deployments'] = [
            {'id': f'dep_{index}', 'sha': NEW, 'baselineSha': OLD,
             'deployedAt': data['coverageStartedAt'], 'classification': 'unknown',
             'commits': [], 'commitCoverageComplete': False,
             'incidentStartedAt': None, 'recoveredAt': None}
            for index in range(ledger.MAX_DEPLOYMENTS)
        ]
        self.path.write_text(json.dumps(data))
        before = self.path.read_bytes()
        with self.assertRaisesRegex(ledger.ObservationError, 'cannot admit'):
            ledger.mark_pending(self.path)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(ledger.capture_state(self.path), 'ready')

    def test_byte_reservation_refuses_admission_before_file_changes(self):
        before = self.path.read_bytes()
        with patch.object(ledger, 'MAX_BYTES', len(before) + ledger.MAX_RECORD_RESERVE - 1):
            with self.assertRaisesRegex(ledger.ObservationError, 'cannot admit'):
                ledger.mark_pending(self.path)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(ledger.capture_state(self.path), 'ready')

    def test_record_reserve_exceeds_largest_allowed_serialized_row(self):
        stamp = ledger.now_utc()
        row = {'id': 'dep_' + 'x' * 120, 'sha': NEW, 'baselineSha': OLD,
               'deployedAt': stamp, 'classification': 'failed-rework',
               'commits': [{'sha': f'{index:040x}', 'committedAt': stamp}
                           for index in range(ledger.MAX_COMMITS)],
               'commitCoverageComplete': True, 'incidentStartedAt': stamp,
               'recoveredAt': stamp}
        self.assertLess(len(json.dumps(row, separators=(',', ':'), sort_keys=True).encode()) + 1,
                        ledger.MAX_RECORD_RESERVE)


if __name__ == '__main__':
    unittest.main()
