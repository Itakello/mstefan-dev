import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name('backup.py')
spec = importlib.util.spec_from_file_location('payload_backup', SCRIPT)
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.source = self.root / 'source'
        self.output = self.root / 'backups'
        self.source.mkdir(mode=0o700)
        self.output.mkdir(mode=0o700)
        self.media = self.source / backup.MEDIA
        self.media.mkdir()
        (self.media / 'photo.png').write_bytes(b'synthetic-media-bytes')
        (self.source / '.env').write_text('DO_NOT_BACK_UP_THIS_ENVIRONMENT_FILE')
        with sqlite3.connect(self.source / backup.DB) as db:
            db.execute('CREATE TABLE content (title TEXT)')
            db.execute('INSERT INTO content VALUES (?)', ('published and draft fixture',))

    def tearDown(self):
        self.temporary.cleanup()

    def run_backup(self, run_id='run-001', **kwargs):
        return backup.backup(self.source, self.output, run_id, runtime_stopped=True, **kwargs)

    def assert_clean(self):
        self.assertEqual(list(self.output.iterdir()), [])

    def test_executable_cli_snapshot_content_integrity_permissions_and_replay(self):
        result = subprocess.run([sys.executable, str(SCRIPT), '--data-dir', str(self.source),
                                 '--output-dir', str(self.output), '--run-id', 'run-001', '--runtime-stopped'],
                                capture_output=True, text=True, check=True)
        report = json.loads(result.stdout)
        archive = Path(report['archive'])
        self.assertEqual(report['status'], 'created')
        self.assertEqual(stat.S_IMODE(archive.stat().st_mode), 0o600)
        with tarfile.open(archive) as bundle:
            self.assertEqual(set(bundle.getnames()), {backup.DB, '.payload-media/photo.png', backup.MANIFEST})
            self.assertTrue(all(member.isfile() and member.mode == 0o600 for member in bundle.getmembers()))
            self.assertEqual(bundle.extractfile('.payload-media/photo.png').read(), b'synthetic-media-bytes')
            restored = self.root / 'restored.db'
            restored.write_bytes(bundle.extractfile(backup.DB).read())
            with sqlite3.connect(restored) as db:
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone(), ('ok',))
                self.assertEqual(db.execute('SELECT title FROM content').fetchone(), ('published and draft fixture',))
        checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
        inode = archive.stat().st_ino
        (self.media / 'photo.png').write_bytes(b'later-change')
        self.assertEqual(self.run_backup()['status'], 'replayed')
        self.assertEqual(archive.stat().st_ino, inode)
        self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), checksum)
        self.assertEqual([p.name for p in self.output.iterdir()], ['payload-run-001.tar'])

    def test_requires_explicit_quiescence_attestation(self):
        result = subprocess.run([sys.executable, str(SCRIPT), '--data-dir', str(self.source),
                                 '--output-dir', str(self.output), '--run-id', 'run-001'], capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assert_clean()

    def test_corrupt_source_cleans_staging(self):
        (self.source / backup.DB).write_bytes(b'invalid database')
        with self.assertRaises(sqlite3.Error):
            self.run_backup()
        self.assert_clean()

    def test_corrupt_existing_output_is_not_replaced(self):
        archive = self.output / 'payload-run-001.tar'
        archive.write_bytes(b'preexisting corrupt backup')
        archive.chmod(0o600)
        with self.assertRaises(tarfile.TarError):
            self.run_backup()
        self.assertEqual(archive.read_bytes(), b'preexisting corrupt backup')
        self.assertEqual(list(self.output.iterdir()), [archive])

    def test_changed_archive_member_fails_integrity_without_overwrite(self):
        archive = Path(self.run_backup()['archive'])
        damaged = self.output / 'damaged.tar'
        with tarfile.open(archive) as source, tarfile.open(damaged, 'w') as target:
            for member in source.getmembers():
                stream = source.extractfile(member)
                if member.name == '.payload-media/photo.png':
                    import io
                    stream = io.BytesIO(b'x' * member.size)
                target.addfile(member, stream)
        damaged.chmod(0o600)
        damaged.replace(archive)
        checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
        with self.assertRaisesRegex(ValueError, 'integrity'):
            self.run_backup()
        self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), checksum)
        self.assertEqual(list(self.output.iterdir()), [archive])

    def test_media_change_during_snapshot_refuses_and_cleans_staging(self):
        original = backup.shutil.copyfileobj
        def changing_copy(source, dest):
            original(source, dest)
            (self.media / 'photo.png').write_bytes(b'concurrent writer')
        with patch.object(backup.shutil, 'copyfileobj', changing_copy):
            with self.assertRaisesRegex(ValueError, 'changed'):
                self.run_backup()
        self.assert_clean()

    def test_no_overwrite_if_destination_appears_during_publication(self):
        archive = self.output / 'payload-run-001.tar'
        original = backup.os.link
        def racing_link(source, target):
            archive.write_bytes(b'other process output')
            original(source, target)
        with patch.object(backup.os, 'link', racing_link):
            with self.assertRaises(FileExistsError):
                self.run_backup()
        self.assertEqual(archive.read_bytes(), b'other process output')
        self.assertEqual(list(self.output.iterdir()), [archive])

    def test_rejects_symlinks_in_source_output_and_media(self):
        link = self.root / 'source-link'
        link.symlink_to(self.source, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Symlinks'):
            backup.backup(link, self.output, 'run', True)
        for location, target in [(self.media / 'link', self.source / '.env'),
                                  (self.media / 'directory-link', self.root),
                                  (self.source / (backup.DB + '-wal'), self.source / '.env'),
                                  (self.output / 'payload-run-001.tar', self.source / '.env')]:
            location.symlink_to(target)
            with self.assertRaisesRegex(ValueError, 'Symlinks'):
                self.run_backup()
            location.unlink()
        db = self.source / backup.DB
        db.rename(self.source / 'original.db')
        db.symlink_to(self.source / 'original.db')
        with self.assertRaisesRegex(ValueError, 'Symlinks'):
            self.run_backup()
        self.assert_clean()

    def test_path_safety_and_source_mismatch(self):
        for run_id in ['../escape', '/absolute', '', 'a' * 65, 'unsafe/name']:
            with self.assertRaises(ValueError):
                self.run_backup(run_id)
        with self.assertRaises(ValueError):
            backup.backup(self.source, self.media, 'run', True)
        self.output.chmod(0o777)
        with self.assertRaisesRegex(ValueError, 'caller-owned'):
            self.run_backup()
        self.output.chmod(0o700)
        self.run_backup()
        other = self.root / 'other-source'
        other.mkdir()
        with self.assertRaisesRegex(ValueError, 'another backup'):
            backup.backup(other, self.output, 'run-001', True)

    def test_wal_commits_are_included_in_snapshot(self):
        db = sqlite3.connect(self.source / backup.DB)
        try:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('PRAGMA wal_autocheckpoint=0')
            db.execute('INSERT INTO content VALUES (?)', ('committed-in-wal',))
            db.commit()
            self.assertGreater((self.source / (backup.DB + '-wal')).stat().st_size, 0)
            archive = Path(self.run_backup()['archive'])
            with tarfile.open(archive) as bundle:
                restored = self.root / 'wal-restore.db'
                restored.write_bytes(bundle.extractfile(backup.DB).read())
                with sqlite3.connect(restored) as restored_db:
                    self.assertEqual(restored_db.execute('SELECT title FROM content ORDER BY rowid').fetchall(),
                                     [('published and draft fixture',), ('committed-in-wal',)])
        finally:
            db.close()

    def test_unsafe_archive_entry_and_relaxed_permissions_are_refused(self):
        archive = Path(self.run_backup()['archive'])
        archive.chmod(0o644)
        with self.assertRaisesRegex(ValueError, '0600'):
            self.run_backup()
        archive.chmod(0o600)
        with tarfile.open(archive, 'a') as bundle:
            link = tarfile.TarInfo('.payload-media/link')
            link.type = tarfile.SYMTYPE
            link.linkname = '/etc/passwd'
            bundle.addfile(link)
        with self.assertRaisesRegex(ValueError, 'unsafe entry'):
            self.run_backup()
        self.assertEqual(list(self.output.iterdir()), [archive])

    def test_empty_media_directory_is_optional(self):
        (self.media / 'photo.png').unlink()
        self.media.rmdir()
        self.assertEqual(self.run_backup()['status'], 'created')


if __name__ == '__main__':
    unittest.main()
