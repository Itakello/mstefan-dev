import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'payload-production'))
import safeguard  # noqa: E402


class RestoreProofTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name).resolve()
        self.data, self.out = root / 'data', root / 'out'
        self.data.mkdir()
        self.out.mkdir(mode=0o700)
        (self.data / '.payload-media').mkdir()
        (self.data / '.payload-media' / 'photo.jpg').write_bytes(b'jpeg')
        with closing(sqlite3.connect(self.data / '.payload-local.db')) as db:
            db.execute('create table payload_migrations (name text)')
            db.executemany('insert into payload_migrations values (?)', [('dev',), ('20260917_initial',)])
            db.commit()

    def archive(self):
        return Path(safeguard.backup.backup(self.data, self.out, 'run', runtime_stopped=True)['archive'])

    def test_restored_archive_reports_migrations(self):
        with tempfile.TemporaryDirectory(dir=self.out) as scratch:
            self.assertEqual(safeguard.restore_proof(self.archive(), Path(scratch)), ['20260917_initial'])

    def test_corrupted_member_is_refused(self):
        archive = self.archive()
        raw = bytearray(archive.read_bytes())
        offset = raw.index(b'jpeg')
        raw[offset:offset + 4] = b'JPEG'
        archive.write_bytes(raw)
        with tempfile.TemporaryDirectory(dir=self.out) as scratch, self.assertRaises(safeguard.Blocked):
            safeguard.restore_proof(archive, Path(scratch))


if __name__ == '__main__':
    unittest.main()
