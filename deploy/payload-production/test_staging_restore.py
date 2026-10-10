import io
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import backup
import staging_restore

ROOT = Path(__file__).resolve().parents[2]


class StagingRestoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.prod = self.root / 'production'
        self.staging = self.root / 'staging'
        self.output = self.root / 'backups'
        self.target = self.root / 'target'
        for path in (self.prod, self.staging, self.output, self.target):
            path.mkdir(mode=0o700)
        for path, identity in ((self.prod, 'production'), (self.staging, 'staging')):
            with sqlite3.connect(path / backup.DB) as db:
                for migration in ('20260917_195926_initial.ts', '20261007_211914_password_reset_throttle.ts'):
                    up = (ROOT / 'migrations' / migration).read_text().split('export async function down')[0].replace('\\`', '"')
                    for statement in re.findall(r'db.run\(sql`(.*?)`\)', up, flags=re.S):
                        db.executescript(statement.replace('\\`', '`'))
                db.execute('CREATE TABLE content (title TEXT)')
                db.execute('INSERT INTO content VALUES (?)', (identity + ' editable content',))
                db.execute('INSERT INTO users (id,email,salt,hash,reset_password_token,reset_password_expiration,reset_password_requested_at,login_attempts,lock_until) VALUES (1,?,?,?,?,?,?,9,?)',
                           (identity + '@example.test', identity + '-salt', identity + '-hash', identity + '-reset', 'expiry', 'requested', 'locked'))
                db.execute("INSERT INTO users_sessions (_order,_parent_id,id,expires_at) VALUES (1,1,?,'expiry')", (identity + '-session',))
                db.execute("INSERT INTO payload_preferences (id,key,value) VALUES (1,'admin','user-data')")
                db.execute("INSERT INTO payload_preferences_rels (parent_id,path,users_id) VALUES (1,'user',1)")
                db.execute("INSERT INTO payload_locked_documents (id,global_slug) VALUES (1,'home')")
                db.execute("INSERT INTO payload_locked_documents_rels (parent_id,path,users_id) VALUES (1,'user',1)")
        for directory, name in ((backup.MEDIA, 'photo.png'), (backup.DOCUMENTS, 'career.pdf')):
            (self.prod / directory).mkdir()
            (self.prod / directory / name).write_bytes(b'production upload ' + name.encode())
        self.archive = Path(backup.backup(self.prod, self.output, 'refresh-1', True)['archive'])
        self.original = self.fingerprint()

    def tearDown(self):
        self.temp.cleanup()

    def fingerprint(self):
        return {str(path.relative_to(self.root)): backup.digest(path) for base in (self.prod, self.staging, self.output)
                for path in base.rglob('*') if path.is_file()}

    def restore(self, **kwargs):
        return staging_restore.restore(self.archive, self.target, self.staging / backup.DB,
                                       'refresh-1', self.prod, **kwargs)

    def assert_refused(self):
        with self.assertRaises((ValueError, sqlite3.Error, tarfile.TarError, OSError)):
            self.restore(staging_stopped=True)
        self.assertEqual(list(self.target.iterdir()), [])

    def test_cli_copies_content_and_uploads_preserves_only_staging_accounts(self):
        result = subprocess.run([sys.executable, str(Path(staging_restore.__file__)),
                                 '--archive', str(self.archive), '--target-dir', str(self.target),
                                 '--staging-db', str(self.staging / backup.DB), '--run-id', 'refresh-1',
                                 '--production-data-dir', str(self.prod), '--staging-stopped'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['status'], 'prepared')
        self.assertNotIn('staging-hash', result.stdout + result.stderr)
        with sqlite3.connect(self.target / backup.DB) as db:
            self.assertEqual(db.execute('SELECT title FROM content').fetchall(), [('production editable content',)])
            self.assertEqual(db.execute('SELECT email,salt,hash FROM users').fetchall(),
                             [('staging@example.test', 'staging-salt', 'staging-hash')])
            self.assertEqual(db.execute('SELECT reset_password_token,reset_password_expiration,reset_password_requested_at,login_attempts,lock_until FROM users').fetchall(), [(None, None, None, 0, None)])
            for table in staging_restore.CLEARED:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM ' + table).fetchone(), (0,))
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchall(), [('ok',)])
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
            db.execute("UPDATE content SET title='free staging edit'")
        for directory, name in ((backup.MEDIA, 'photo.png'), (backup.DOCUMENTS, 'career.pdf')):
            self.assertEqual((self.target / directory / name).read_bytes(), (self.prod / directory / name).read_bytes())
        self.assertNotIn(b'production-hash', (self.target / backup.DB).read_bytes())
        self.assertNotIn(b'production-session', (self.target / backup.DB).read_bytes())
        self.assertEqual(self.fingerprint(), self.original)
        with self.assertRaisesRegex(ValueError, 'empty'):
            self.restore(staging_stopped=True)

    def test_partial_publication_failure_cleans_target_and_preserves_sources(self):
        original_copytree = staging_restore.shutil.copytree
        observed = []

        def failing_upload_copy(source, destination, **kwargs):
            self.assertTrue((self.target / backup.DB).is_file())
            original_copytree(source, destination, **kwargs)
            observed.append(destination)
            self.assertTrue(any(destination.iterdir()))
            raise failure('synthetic upload publication failure')

        for failure in (OSError, KeyboardInterrupt):
            with self.subTest(failure=failure):
                observed.clear()
                with patch.object(staging_restore.shutil, 'copytree', failing_upload_copy):
                    with self.assertRaisesRegex(failure, 'synthetic upload publication failure'):
                        self.restore(staging_stopped=True)
                self.assertEqual(observed, [self.target / backup.MEDIA])
                self.assertEqual(list(self.target.iterdir()), [])
                self.assertEqual(self.fingerprint(), self.original)
        self.assertEqual(self.restore(staging_stopped=True)['status'], 'prepared')

    def test_requires_stopped_checkpointed_staging_and_empty_private_target(self):
        with self.assertRaises(ValueError):
            self.restore()
        sidecar = self.staging / (backup.DB + '-wal')
        sidecar.write_bytes(b'uncheckpointed')
        self.assert_refused()
        sidecar.unlink()
        self.target.chmod(0o777)
        self.assert_refused()
        self.target.chmod(0o700)
        (self.target / 'keep').write_bytes(b'preserved')
        with self.assertRaises(ValueError):
            self.restore(staging_stopped=True)
        self.assertEqual((self.target / 'keep').read_bytes(), b'preserved')
        self.assertEqual(self.fingerprint(), self.original)

    def test_rejects_symlink_and_overlap_without_touching_sources(self):
        target = self.target
        self.target = self.root / 'target-link'
        self.target.symlink_to(target, target_is_directory=True)
        with self.assertRaises(ValueError):
            self.restore(staging_stopped=True)
        self.target.unlink()
        self.target = self.staging / 'nested-target'
        self.target.mkdir()
        self.assert_refused()
        self.target.rmdir()
        self.target = self.prod / 'nested-target'
        self.target.mkdir()
        self.assert_refused()
        self.target.rmdir()
        sidecar = self.staging / (backup.DB + '-wal')
        sidecar.symlink_to(self.archive)
        self.target = target
        self.assert_refused()
        sidecar.unlink()
        self.assertEqual(self.fingerprint(), self.original)

    def test_production_accounts_cannot_be_selected_as_staging_source(self):
        for account_source in (self.prod / backup.DB, self.prod / 'nested' / backup.DB):
            if not account_source.exists():
                account_source.parent.mkdir()
                os.link(self.prod / backup.DB, account_source)
            before = self.fingerprint()
            with self.assertRaisesRegex(ValueError, 'separate from production'):
                staging_restore.restore(self.archive, self.target, account_source,
                                        'refresh-1', self.prod, True)
            self.assertEqual(self.fingerprint(), before)
            self.assertEqual(list(self.target.iterdir()), [])
        alias = self.root / 'production-db-hardlink'
        os.link(self.prod / backup.DB, alias)
        with self.assertRaisesRegex(ValueError, 'separate from production'):
            staging_restore.restore(self.archive, self.target, alias, 'refresh-1', self.prod, True)
        with self.assertRaisesRegex(ValueError, 'separate files'):
            staging_restore.restore(self.archive, self.target, self.archive, 'refresh-1', self.prod, True)
        self.assertEqual(list(self.target.iterdir()), [])
        self.assertEqual(self.fingerprint(), before)

    def rewrite_archive(self, mutate):
        candidate = self.output / 'candidate.tar'
        with tarfile.open(self.archive) as source, tarfile.open(candidate, 'w') as dest:
            for member in source.getmembers():
                data = source.extractfile(member).read()
                dest.addfile(member, io.BytesIO(mutate(member.name, data)))
        candidate.chmod(0o600)
        candidate.replace(self.archive)

    def test_corrupt_and_unsafe_archives_refused_and_preserved(self):
        self.rewrite_archive(lambda name, data: b'x' * len(data) if name.endswith('photo.png') else data)
        before = self.fingerprint()
        self.assert_refused()
        self.assertEqual(self.fingerprint(), before)
        self.archive.unlink()
        self.archive = Path(backup.backup(self.prod, self.output, 'refresh-1', True)['archive'])
        with tarfile.open(self.archive, 'a') as bundle:
            member = tarfile.TarInfo('../escape')
            bundle.addfile(member, io.BytesIO())
        before = self.fingerprint()
        self.assert_refused()
        self.assertEqual(self.fingerprint(), before)
        self.assertFalse((self.root / 'escape').exists())

    def test_mismatched_schema_and_unknown_relationship_fail_closed(self):
        with sqlite3.connect(self.staging / backup.DB) as db:
            db.execute('ALTER TABLE users ADD future_auth TEXT')
        before = self.fingerprint()
        self.assert_refused()
        self.assertEqual(self.fingerprint(), before)
        with sqlite3.connect(self.staging / backup.DB) as db:
            db.execute('ALTER TABLE users DROP COLUMN future_auth')
        with sqlite3.connect(self.prod / backup.DB) as db:
            db.execute('CREATE TABLE content_auth (user_id INTEGER REFERENCES users(id))')
            db.execute('INSERT INTO content_auth VALUES (1)')
        self.archive.unlink()
        self.archive = Path(backup.backup(self.prod, self.output, 'refresh-1', True)['archive'])
        before = self.fingerprint()
        self.assert_refused()
        self.assertEqual(self.fingerprint(), before)

    def test_foreign_key_damage_and_no_staging_credentials_fail_closed(self):
        with sqlite3.connect(self.staging / backup.DB) as db:
            db.execute('UPDATE users_sessions SET _parent_id=99')
        self.assert_refused()
        with sqlite3.connect(self.staging / backup.DB) as db:
            db.execute('UPDATE users_sessions SET _parent_id=1')
            db.execute('UPDATE users SET hash=NULL')
        self.assert_refused()


if __name__ == '__main__':
    unittest.main()
