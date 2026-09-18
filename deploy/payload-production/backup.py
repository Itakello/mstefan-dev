#!/usr/bin/env python3
"""Back up a stopped Payload volume without reading environment or credential files."""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import stat
import tarfile
import tempfile
import time

DB = '.payload-local.db'
MEDIA = '.payload-media'
MANIFEST = 'manifest.json'


def regular_path(path, directory=False):
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts:
        raise ValueError('Paths must be absolute and contain no parent traversal')
    for component in [*reversed(path.parents), path]:
        if component.is_symlink():
            raise ValueError('Symlinks are not permitted')
    mode = path.stat().st_mode
    if not (stat.S_ISDIR(mode) if directory else stat.S_ISREG(mode)):
        raise ValueError('Expected an ordinary directory' if directory else 'Expected an ordinary file')
    return path


def digest(path):
    regular_path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode):
            raise ValueError('Only ordinary files may be backed up')
        result = hashlib.file_digest(stream, 'sha256').hexdigest()
        after = os.fstat(stream.fileno())
        if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
            raise ValueError('Source changed during backup')
        return {'sha256': result, 'size': after.st_size}


def media_files(source):
    root = source / MEDIA
    if not root.exists() and not root.is_symlink():
        return []
    regular_path(root, directory=True)
    files = []
    for directory, dirs, names in os.walk(root, followlinks=False):
        for name in dirs:
            regular_path(Path(directory) / name, directory=True)
        for name in names:
            files.append(regular_path(Path(directory) / name))
    return sorted(files)


def source_fingerprint(source):
    result = {DB: digest(source / DB)}
    for suffix in ('-wal', '-shm', '-journal'):
        sidecar = source / (DB + suffix)
        if sidecar.exists() or sidecar.is_symlink():
            regular_path(sidecar)
            # SQLite may create empty WAL/SHM files itself on a read-only connection.
            if suffix != '-shm' and sidecar.stat().st_size:
                result[DB + suffix] = digest(sidecar)
    for path in media_files(source):
        result[path.relative_to(source).as_posix()] = digest(path)
    return result


def check_database(path):
    with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)) as db:
        if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise ValueError('SQLite integrity verification failed')


def verify_archive(archive, run_id, source_id, scratch):
    regular_path(archive)
    metadata = archive.stat()
    if metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) != 0o600:
        raise ValueError('Archive must be caller-owned with mode 0600')
    with tarfile.open(archive, 'r:') as bundle:
        members = bundle.getmembers()
        names = [member.name for member in members]
        if len(names) != len(set(names)) or MANIFEST not in names:
            raise ValueError('Invalid backup inventory')
        for member in members:
            path = Path(member.name)
            if not member.isfile() or path.is_absolute() or '..' in path.parts:
                raise ValueError('Archive contains an unsafe entry')
            if member.name not in (DB, MANIFEST) and not member.name.startswith(MEDIA + '/'):
                raise ValueError('Archive contains an unexpected entry')
        manifest_member = bundle.getmember(MANIFEST)
        if manifest_member.size > 1024 * 1024:
            raise ValueError('Backup manifest exceeds its size limit')
        manifest = json.load(bundle.extractfile(manifest_member))
        if manifest.get('format') != 1 or manifest.get('run_id') != run_id or manifest.get('source_id') != source_id:
            raise ValueError('Existing output belongs to another backup request')
        inventory = manifest.get('files', {})
        if set(inventory) != set(names) - {MANIFEST} or DB not in inventory:
            raise ValueError('Backup manifest does not match archive contents')
        for member in members:
            if member.name == MANIFEST:
                continue
            with bundle.extractfile(member) as stream:
                actual = {'sha256': hashlib.file_digest(stream, 'sha256').hexdigest(), 'size': member.size}
            if actual != inventory[member.name]:
                raise ValueError('Backup content integrity verification failed')
        database = scratch / 'verify.db'
        with bundle.extractfile(DB) as stream, database.open('xb') as output:
            shutil.copyfileobj(stream, output)
        check_database(database)
        database.unlink()


def backup(source, output_dir, run_id, runtime_stopped=False):
    if not runtime_stopped:
        raise ValueError('Confirm the runtime and all other writers are stopped using --runtime-stopped')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', run_id):
        raise ValueError('Run ID must be 1-64 letters, digits, underscores or hyphens')
    source = regular_path(source, directory=True)
    output_dir = regular_path(output_dir, directory=True)
    owner = output_dir.stat()
    if owner.st_uid != os.getuid() or owner.st_mode & 0o022:
        raise ValueError('Output directory must be caller-owned and not group/world writable')
    if output_dir == source or source in output_dir.parents:
        raise ValueError('Output directory must be outside the source volume')
    source_id = hashlib.sha256(str(source).encode()).hexdigest()
    output = output_dir / f'payload-{run_id}.tar'
    old_mask = os.umask(0o077)
    try:
        with tempfile.TemporaryDirectory(prefix='.payload-backup-', dir=output_dir) as temporary:
            stage = Path(temporary)
            if output.exists() or output.is_symlink():
                verify_archive(output, run_id, source_id, stage)
                return {'status': 'replayed', 'archive': str(output)}
            before = source_fingerprint(source)
            database = stage / DB
            deadline = time.monotonic() + 30

            def progress(*_):
                if time.monotonic() > deadline:
                    raise ValueError('SQLite backup exceeded 30 seconds; confirm all writers are stopped')

            with closing(sqlite3.connect((source / DB).as_uri() + '?mode=ro', uri=True, timeout=1)) as src:
                with closing(sqlite3.connect(database)) as dest:
                    src.backup(dest, pages=128, progress=progress, sleep=0.1)
            check_database(database)
            files = {DB: digest(database)}
            for original in media_files(source):
                relative = original.relative_to(source)
                target = stage / relative
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                fd = os.open(original, os.O_RDONLY | os.O_NOFOLLOW)
                with os.fdopen(fd, 'rb') as stream, target.open('xb') as dest:
                    shutil.copyfileobj(stream, dest)
                files[relative.as_posix()] = digest(target)
                if files[relative.as_posix()] != before.get(relative.as_posix()):
                    raise ValueError('Media changed during backup')
            if source_fingerprint(source) != before:
                raise ValueError('Source changed during backup; output was not published')
            manifest = {'format': 1, 'run_id': run_id, 'source_id': source_id, 'files': files}
            (stage / MANIFEST).write_text(json.dumps(manifest, sort_keys=True) + '\n')
            candidate = stage / 'backup.tar'
            with tarfile.open(candidate, 'w', format=tarfile.PAX_FORMAT) as bundle:
                for name in sorted([*files, MANIFEST]):
                    info = bundle.gettarinfo(str(stage / name), arcname=name)
                    info.uid = info.gid = info.mtime = 0
                    info.uname = info.gname = ''
                    info.mode = 0o600
                    with (stage / name).open('rb') as stream:
                        bundle.addfile(info, stream)
            verify_archive(candidate, run_id, source_id, stage)
            with candidate.open('rb') as stream:
                os.fsync(stream.fileno())
            # link() publishes atomically and refuses an existing destination, including symlinks.
            os.link(candidate, output)
            fd = os.open(output_dir, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
            return {'status': 'created', 'archive': str(output)}
    finally:
        os.umask(old_mask)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--runtime-stopped', action='store_true')
    args = parser.parse_args()
    try:
        print(json.dumps(backup(args.data_dir, args.output_dir, args.run_id, args.runtime_stopped)))
    except (ValueError, OSError, sqlite3.Error, tarfile.TarError, KeyError, TypeError) as error:
        parser.exit(1, f'Backup refused: {error}\n')


if __name__ == '__main__':
    main()
