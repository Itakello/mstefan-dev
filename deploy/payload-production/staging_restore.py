#!/usr/bin/env python3
"""Prepare an offline staging volume from a verified backup and local staging users."""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tarfile
import tempfile

import backup

PRESERVED = ('id', 'updated_at', 'created_at', 'email', 'salt', 'hash')
TRANSIENT = ('reset_password_token', 'reset_password_expiration', 'login_attempts',
             'lock_until', 'reset_password_requested_at')
CLEARED = ('users_sessions', 'payload_locked_documents_rels', 'payload_preferences_rels',
           'payload_locked_documents', 'payload_preferences')


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def user_schema(db):
    columns = db.execute('PRAGMA table_info(users)').fetchall()
    names = {column[1] for column in columns}
    required = set(PRESERVED + TRANSIENT[:-1])
    if names not in (required, required | {TRANSIENT[-1]}):
        raise ValueError('Unsupported users schema; review the auth migration before restoring')
    if db.execute('PRAGMA foreign_key_list(users)').fetchall():
        raise ValueError('Unsupported users relationships')
    return columns


def verify_database(db):
    if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
        raise ValueError('SQLite integrity verification failed')
    if db.execute('PRAGMA foreign_key_check').fetchall():
        raise ValueError('SQLite foreign key verification failed')


def restore(archive, target, staging_db, run_id, production_dir, staging_stopped=False):
    if not staging_stopped:
        raise ValueError('Stop staging writers and confirm using --staging-stopped')
    production_dir = backup.regular_path(production_dir, directory=True)
    source_id = hashlib.sha256(str(production_dir).encode()).hexdigest()
    archive = backup.regular_path(archive)
    staging_db = backup.regular_path(staging_db)
    production_db = production_dir / backup.DB
    if production_dir in staging_db.parents or (production_db.exists() and staging_db.samefile(production_db)):
        raise ValueError('Staging account source must be separate from production')
    if archive.samefile(staging_db):
        raise ValueError('Archive and staging database must be separate files')
    target = backup.regular_path(target, directory=True)
    if target.stat().st_uid != os.getuid() or target.stat().st_mode & 0o022:
        raise ValueError('Target must be caller-owned and not group/world writable')
    if any(target.iterdir()):
        raise ValueError('Target must be empty')
    if target == production_dir or target in production_dir.parents or production_dir in target.parents:
        raise ValueError('Production source and target must not overlap')
    for source in (archive, staging_db):
        if target == source or target in source.parents or source.parent in target.parents:
            raise ValueError('Source and target must not overlap')
    for suffix in ('-wal', '-shm', '-journal'):
        sidecar = Path(str(staging_db) + suffix)
        if sidecar.exists() or sidecar.is_symlink():
            backup.regular_path(sidecar)
            if sidecar.stat().st_size:
                raise ValueError('Staging database must be stopped and checkpointed without active sidecars')
    archive_before = backup.digest(archive)
    staging_before = backup.digest(staging_db)
    old_mask = os.umask(0o077)
    published = []
    try:
        with tempfile.TemporaryDirectory(prefix='.staging-restore-', dir=target.parent) as temporary:
            stage = Path(temporary)
            backup.verify_archive(archive, run_id, source_id, stage)
            with tarfile.open(archive, 'r:') as bundle:
                manifest = json.load(bundle.extractfile(backup.MANIFEST))
                for name, expected in manifest['files'].items():
                    dest = stage / name
                    dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                    with bundle.extractfile(name) as src, dest.open('xb') as out:
                        shutil.copyfileobj(src, out)
                    if backup.digest(dest) != expected:
                        raise ValueError('Extracted backup integrity verification failed')
            database = stage / backup.DB
            with closing(sqlite3.connect(staging_db.as_uri() + '?mode=ro&immutable=1', uri=True)) as src:
                verify_database(src)
                schema = user_schema(src)
                users = src.execute('SELECT ' + ','.join(map(quote, PRESERVED)) + ' FROM users').fetchall()
            if not users or any(not row[3] or not row[4] or not row[5] for row in users):
                raise ValueError('Staging must contain local accounts with password credentials')
            with closing(sqlite3.connect(database)) as dest:
                verify_database(dest)
                if user_schema(dest) != schema:
                    raise ValueError('Staging and backup users schemas do not match')
                tables = [row[0] for row in dest.execute("SELECT name FROM sqlite_master WHERE type='table'")]
                if not set(CLEARED).issubset(tables):
                    raise ValueError('Unsupported auth tables')
                for table in tables:
                    if table.startswith('users_') and table != 'users_sessions':
                        raise ValueError('Unsupported auth table')
                    for fk in dest.execute('PRAGMA foreign_key_list(' + quote(table) + ')'):
                        if fk[2] == 'users' and table not in CLEARED:
                            raise ValueError('Unsupported content relationship to users')
                if dest.execute("SELECT 1 FROM sqlite_master WHERE type='trigger'").fetchone():
                    raise ValueError('Database triggers require restore review')
                dest.execute('PRAGMA foreign_keys=ON')
                dest.execute('PRAGMA secure_delete=ON')
                with dest:
                    for table in CLEARED:
                        dest.execute('DELETE FROM ' + quote(table))
                    dest.execute('DELETE FROM users')
                    dest.executemany('INSERT INTO users (' + ','.join(map(quote, PRESERVED)) + ') VALUES (?,?,?,?,?,?)', users)
                    dest.execute('UPDATE users SET login_attempts=0')
                # Remove freed pages containing deleted production credentials and sessions.
                dest.execute('VACUUM')
                verify_database(dest)
                if dest.execute('SELECT ' + ','.join(map(quote, PRESERVED)) + ' FROM users').fetchall() != users:
                    raise ValueError('Staging account preservation failed')
                if any(dest.execute('SELECT COUNT(*) FROM ' + quote(table)).fetchone()[0] for table in CLEARED):
                    raise ValueError('Auth state cleanup failed')
                for column in TRANSIENT:
                    if column in {row[1] for row in schema} and column != 'login_attempts':
                        if dest.execute('SELECT COUNT(*) FROM users WHERE ' + quote(column) + ' IS NOT NULL').fetchone()[0]:
                            raise ValueError('Transient auth cleanup failed')
            if backup.digest(archive) != archive_before or backup.digest(staging_db) != staging_before:
                raise ValueError('Source changed during preparation')
            if any(target.iterdir()):
                raise ValueError('Target changed during preparation')
            for name in (backup.DB, backup.MEDIA, backup.DOCUMENTS):
                candidate = stage / name
                if candidate.exists():
                    # Exclusive reservation refuses a destination that appeared during preparation.
                    if candidate.is_dir():
                        destination = target / name
                        destination.mkdir(mode=0o700)
                        published.append(destination)
                        shutil.copytree(candidate, destination, dirs_exist_ok=True)
                    else:
                        os.link(candidate, target / name)
                        published.append(target / name)
            expected = dict(manifest['files'])
            expected[backup.DB] = backup.digest(database)
            if backup.source_fingerprint(target) != expected:
                raise ValueError('Prepared volume integrity verification failed')
            return {'status': 'prepared', 'target': str(target)}
    except BaseException:
        for path in reversed(published):
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
        raise
    finally:
        os.umask(old_mask)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', required=True, type=Path)
    parser.add_argument('--target-dir', required=True, type=Path)
    parser.add_argument('--staging-db', required=True, type=Path)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--production-data-dir', required=True, type=Path)
    parser.add_argument('--staging-stopped', action='store_true')
    args = parser.parse_args()
    try:
        print(json.dumps(restore(args.archive, args.target_dir, args.staging_db,
                                 args.run_id, args.production_data_dir, args.staging_stopped)))
    except (ValueError, OSError, sqlite3.Error, tarfile.TarError, KeyError, TypeError):
        parser.exit(1, 'Staging restore refused; verify paths, archive integrity and supported auth schema.\n')


if __name__ == '__main__':
    main()
