#!/usr/bin/python3
"""Socket-activated pre-deploy safeguard. Takes no input.

Backs up the live Payload volume, proves the archive restores in isolation,
and retains the running image, so a protected change can deploy unattended.
"""
import hashlib
import json
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
from contextlib import closing
from pathlib import Path

sys.path.insert(0, '/opt/mstefan-event-deploy')
import backup  # noqa: E402
from release_observations import valid_id  # noqa: E402
from controller import CONTAINER_PREFIX, VOLUME, Blocked, read_activation, storage_config  # noqa: E402

OUTPUT = Path('/var/backups/mstefan-payload/predeploy')
RETAINED = 'mstefan/payload-retained'
KEEP = 5
ATTEMPTS = 3


def docker(*args):
    result = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=60, check=False)
    if result.returncode != 0:
        raise Blocked('docker ' + args[0] + ' failed')
    return result.stdout.strip()


def running_deployment():
    rows = [row.split() for row in docker('ps', '--format', '{{.Names}} {{.ID}}').splitlines()]
    # Preview and sandbox containers share the prefix; only `<prefix><deployment ID>` is production.
    matches = [(name[len(CONTAINER_PREFIX):], container) for name, container in rows
               if name.startswith(CONTAINER_PREFIX) and valid_id(name[len(CONTAINER_PREFIX):])]
    if len(matches) != 1:
        raise Blocked('expected exactly one running production container')
    return matches[0]


def restore_proof(archive, scratch):
    target = scratch / 'restore'
    target.mkdir(mode=0o700)
    with tarfile.open(archive) as bundle:
        bundle.extractall(target, filter='data')
    manifest = json.loads((target / backup.MANIFEST).read_text())
    for name, expected in manifest['files'].items():
        if backup.digest(target / name) != expected:
            raise Blocked('restored file hash mismatch')
    with closing(sqlite3.connect((target / backup.DB).as_uri() + '?mode=ro', uri=True)) as db:
        if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise Blocked('restored SQLite integrity failed')
        if db.execute('PRAGMA foreign_key_check').fetchall():
            raise Blocked('restored SQLite foreign keys failed')
        return [row[0] for row in db.execute("select name from payload_migrations where name != 'dev' order by name")]


def prune():
    archives = sorted(OUTPUT.glob('payload-*.tar'), key=lambda path: path.stat().st_mtime)
    for old in archives[:-KEEP]:
        old.unlink()
    tags = docker('images', RETAINED, '--format', '{{.CreatedAt}}\t{{.Tag}}').splitlines()
    for line in sorted(tags)[:-KEEP]:
        try:
            docker('rmi', RETAINED + ':' + line.split('\t')[1])
        except Blocked:
            pass  # An image still used by a container keeps its tag until a later run.


def safeguard():
    storage_config(read_activation())
    deployment, container = running_deployment()
    source = Path(docker('volume', 'inspect', VOLUME, '--format', '{{.Mountpoint}}'))
    OUTPUT.mkdir(mode=0o700, parents=True, exist_ok=True)
    stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
    for attempt in range(ATTEMPTS):
        try:
            # The SQLite backup API snapshots the live database consistently; backup() also refuses
            # to publish if the database or uploads changed while it ran.
            archive = Path(backup.backup(source, OUTPUT, f'{deployment}-{stamp}-{attempt}', runtime_stopped=True)['archive'])
            break
        except ValueError:
            if attempt == ATTEMPTS - 1:
                raise
            time.sleep(5)
    with tempfile.TemporaryDirectory(dir=OUTPUT, prefix='.restore-') as scratch:
        migrations = restore_proof(archive, Path(scratch))
    image = RETAINED + ':' + deployment
    docker('tag', docker('inspect', '--format', '{{.Image}}', container), image)
    prune()
    with archive.open('rb') as stream:
        archive_sha = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'ok': True, 'deployment': deployment, 'archive': str(archive), 'archiveSha256': archive_sha,
            'image': image, 'migrations': migrations}


def main():
    try:
        result = safeguard()
    except Exception as error:  # Report a bounded failure to the caller; details go to the journal.
        print('safeguard failed: ' + type(error).__name__ + ': ' + str(error)[:500], file=sys.stderr)
        result = {'ok': False}
    sys.stdout.write(json.dumps(result))
    sys.stdout.flush()


if __name__ == '__main__':
    main()
