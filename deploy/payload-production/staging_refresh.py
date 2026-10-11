#!/usr/bin/env python3
"""Attended Staging data refresh; plan is read-only, apply replaces experiments."""
import argparse
from contextlib import closing
import fcntl
import hashlib
import html
import json
import os
from pathlib import Path
import re
import signal
import sqlite3
import stat
import subprocess
import sys
import tempfile
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import backup
import staging_restore
from refresh_notion import Notion

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'event'))
from controller import tree_identity

ORG = 'org_bf9659df-3efc-4659-8893-13baf6533b28'
PROD = 'proj_w1kqcgR7eY2EZhht'
STAGE = 'proj_O2VNyRAFMaVmSZA9'
SERVER = '9ed4f42b-9fc7-4987-8cb4-b44524710d8b'
SLUGS = {PROD: 'mstefan-payload', STAGE: 'mstefan-payload-preview'}
VOLUME = 'openship-mstefan-payload-data'
STATE_ROOT = Path('/var/backups/mstefan-payload/staging-refresh')
DEPLOY_LOCK = Path('/var/lib/mstefan-event-deploy/controller.lock')
COMPATIBILITY = Path('/etc/mstefan-staging-refresh/compatibility.json')
RUN = re.compile(r'^refresh-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$')
ID = re.compile(r'^dep_[A-Za-z0-9_-]+$')
SHA = re.compile(r'^[0-9a-f]{40}$')
TERMINAL = {'ready', 'failed', 'cancelled', 'canceled', 'no_changes'}


class Refused(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise Refused('HTTP redirect refused')


def private(path, directory=False):
    path = backup.regular_path(path, directory=directory)
    info = path.stat()
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise Refused('Private paths must be caller-owned with mode 0600/0700')
    return path


def save(path, value):
    private(path.parent, directory=True)
    fd, temporary = tempfile.mkstemp(prefix='.state-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, sort_keys=True)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        if path.is_symlink():
            raise Refused('State symlink refused')
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def value(response):
    if not isinstance(response, dict) or 'data' not in response:
        raise Refused('Provider response contract changed')
    return response['data']


class Client:
    def __init__(self, credentials):
        self.credentials = credentials
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect)

    def request(self, method, url, token=None, body=None, headers=None, raw=False):
        headers = {'Accept': 'application/json', 'User-Agent': 'mstefan-staging-refresh/1', **(headers or {})}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        data = None if body is None else json.dumps(body).encode()
        if data is not None:
            headers['Content-Type'] = 'application/json'
        try:
            with self.opener.open(urllib.request.Request(url, data=data, headers=headers, method=method), timeout=15) as response:
                payload = response.read(4 * 1024 * 1024 + 1)
                if len(payload) > 4 * 1024 * 1024:
                    raise Refused('Response too large')
                return payload if raw else json.loads(payload)
        except urllib.error.HTTPError as error:
            raise Refused('HTTP ' + method + ' failed with status ' + str(error.code)) from None
        except (urllib.error.URLError, ValueError, TimeoutError):
            raise Refused('HTTP ' + method + ' unavailable or invalid') from None

    def ship(self, method, path, body=None):
        patch = (method == 'PATCH' and path == '/projects/' + STAGE and isinstance(body, dict)
                 and set(body) == {'volumes'} and isinstance(body['volumes'], list) and len(body['volumes']) == 1
                 and isinstance(body['volumes'][0], str) and re.fullmatch(
                     r'(staging-data|refresh-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}):/data', body['volumes'][0]))
        if method != 'GET' and not patch and not (
                method == 'POST' and path == '/deployments' and body == {'projectId': STAGE, 'environment': 'preview', 'refresh': True}):
            raise Refused('OpenShip mutation outside Staging refresh refused')
        return self.request(method, 'http://127.0.0.1:4000/api' + path,
                            self.credentials['openship'], body,
                            {'X-Organization-Id': ORG, 'X-Openship-Scope': 'fixed'})

    def notion(self, role, method, path, body=None):
        if role not in {'source', 'target'} or (role == 'source' and not (
                method == 'GET' or method == 'POST' and path.endswith('/query'))):
            raise Refused('Notion source mutation refused')
        return self.request(method, 'https://api.notion.com/v1' + path,
                            self.credentials['notion_' + role], body,
                            {'Notion-Version': '2025-09-03'})

    def compatible(self, first, second):
        trees = [tree_identity(self.request('GET', 'https://api.github.com/repos/Itakello/mstefan-dev/git/trees/' + sha + '?recursive=1'))
                 for sha in (first, second)]
        return sorted(path for path in trees[0].keys() | trees[1].keys() if trees[0].get(path) != trees[1].get(path))

    def health(self, staging=False):
        base = 'https://staging.mstefan.dev' if staging else 'https://www.mstefan.dev'
        pages = {}
        for locale in ('en', 'it'):
            for suffix in ('', '/projects', '/about'):
                pages[locale + suffix] = self.request('GET', base + '/' + locale + suffix, raw=True)
        if not staging:
            try:
                self.request('GET', base + '/admin', raw=True)
            except Refused as error:
                if str(error) != 'HTTP GET failed with status 404':
                    raise
            else:
                raise Refused('Production public CMS exposed')
        return pages

    def login(self):
        response = self.request('POST', 'https://staging.mstefan.dev/api/users/login',
                                body={'email': self.credentials['staging_email'], 'password': self.credentials['staging_password']})
        if response.get('user', {}).get('email') != self.credentials['staging_email'] or not response.get('token'):
            raise Refused('Staging sign-in verification failed')
        for locale in ('en', 'it'):
            for name in ('home', 'about', 'career'):
                page = self.request('GET', 'https://staging.mstefan.dev/api/globals/' + name + '?locale=' + locale,
                                    token=response['token'])
                if page.get('_status') != 'published':
                    raise Refused('Staging published content verification failed')


class Host:
    def command(self, *args):
        try:
            result = subprocess.run(args, capture_output=True, timeout=45)
        except (OSError, subprocess.TimeoutExpired):
            raise Refused('Host operation unavailable or timed out') from None
        if result.returncode:
            raise Refused('Host operation failed; inspect exact retained resources')
        return result.stdout

    def docker(self, *args):
        return self.command('docker', *args)

    def inspect(self, name):
        objects = json.loads(self.docker('inspect', name))
        if len(objects) != 1:
            raise Refused('Container identity ambiguous')
        item = objects[0]
        # Only this allowlist leaves the private Docker response, never Config.Env.
        return {**{key: item[key] for key in ('Id', 'Name', 'Image', 'State', 'Mounts', 'HostConfig', 'NetworkSettings')},
                'User': item['Config'].get('User')}

    def volume(self, name):
        records = json.loads(self.docker('volume', 'inspect', name))
        expected = '/var/lib/docker/volumes/' + name + '/_data'
        if len(records) != 1 or records[0].get('Name') != name or records[0].get('Mountpoint') != expected or records[0].get('Driver') != 'local' or records[0].get('Options'):
            raise Refused('Volume identity or local storage changed')
        return backup.regular_path(Path(expected), directory=True)

    def writers(self, root):
        ids = self.docker('ps', '-aq').decode().split()
        result = []
        for identity in ids:
            item = self.inspect(identity)
            state = item['State']
            if not any(state.get(flag) for flag in ('Running', 'Paused', 'Restarting')):
                continue
            for mount in item['Mounts']:
                if not mount.get('RW'):
                    continue
                source = Path(os.path.realpath(mount.get('Source', '')))
                if source == root or source in root.parents or root in source.parents:
                    if mount.get('Type') != 'volume' or source != root or mount.get('Destination') != '/data':
                        raise Refused('Overlapping bind, parent or nested writer refused')
                    result.append(item['Id'])
        return result

    def runtime(self, project, record, volume, running=True):
        deployment = project.get('activeDeploymentId')
        if not ID.fullmatch(str(deployment)) or record.get('id') != deployment or record.get('projectId') != project['id'] or record.get('status') != 'ready' or not SHA.fullmatch(str(record.get('commitSha'))):
            raise Refused('Active deployment is not an identified ready revision')
        root = self.volume(volume)
        name = 'openship-' + project['slug'] + '-' + deployment
        item = self.inspect(name)
        mounts = item['Mounts']
        if item['Name'] != '/' + name or len(mounts) != 1 or any(mounts[0].get(k) != v for k, v in {
                'Type': 'volume', 'Name': volume, 'Source': str(root), 'Destination': '/data', 'RW': True}.items()):
            raise Refused('Exact separate data mount not established')
        if item['State'].get('Running') is not running or item['State'].get('Paused') or item['State'].get('Restarting'):
            raise Refused('Runtime state changed')
        if item['User'] != 'node':
            raise Refused('Runtime user changed')
        if self.writers(root) != ([item['Id']] if running else []):
            raise Refused('Sole writer not established')
        port = item['NetworkSettings']['Ports'].get('3000/tcp')
        if running and (not isinstance(port, list) or len(port) != 1 or port[0].get('HostIp') != '127.0.0.1'):
            raise Refused('Private loopback application port not established')
        uid, gid = (root / backup.DB).stat().st_uid, (root / backup.DB).stat().st_gid
        if running and (self.docker('exec', name, 'id', '-u').decode().strip(), self.docker('exec', name, 'id', '-g').decode().strip()) != (str(uid), str(gid)):
            raise Refused('Database ownership differs from the runtime principal')
        return {'container': name, 'id': item['Id'], 'image': item['Image'], 'commit': record['commitSha'],
                'deployment': deployment, 'volume': volume, 'path': str(root), 'restart': item['HostConfig']['RestartPolicy'],
                'port': port[0]['HostPort'] if running else None,
                'uid': uid, 'gid': gid}

    def stop(self, runtime):
        current = self.inspect(runtime['id'])
        if current['Image'] != runtime['image'] or self.writers(Path(runtime['path'])) != [runtime['id']]:
            raise Refused('Runtime/writers changed before stop')
        self.docker('update', '--restart=no', runtime['id'])
        self.docker('stop', '--time=20', runtime['id'])
        if self.inspect(runtime['id'])['State'].get('Running') or self.writers(Path(runtime['path'])):
            raise Refused('Writers remain after stop')

    def restart(self, runtime):
        if self.writers(Path(runtime['path'])) not in ([], [runtime['id']]):
            raise Refused('Competing writer prevents recovery')
        policy = runtime['restart']
        name = policy['Name'] or 'no'
        if name == 'on-failure' and policy.get('MaximumRetryCount'):
            name += ':' + str(policy['MaximumRetryCount'])
        self.docker('update', '--restart=' + name, runtime['id'])
        self.docker('start', runtime['id'])
        if not self.inspect(runtime['id'])['State'].get('Running') or self.writers(Path(runtime['path'])) != [runtime['id']]:
            raise Refused('Original runtime recovery failed')

    def stopped(self, runtime):
        item = self.inspect(runtime['id'])
        if item['Image'] != runtime['image'] or item['Name'] != '/' + runtime['container'] or any(
                item['State'].get(flag) for flag in ('Running', 'Paused', 'Restarting')):
            raise Refused('Retained runtime identity/state changed')
        if len(item['Mounts']) != 1 or any(item['Mounts'][0].get(key) != expected for key, expected in {
                'Type': 'volume', 'Name': runtime['volume'], 'Source': runtime['path'], 'Destination': '/data', 'RW': True}.items()):
            raise Refused('Retained data mount changed')
        if self.writers(Path(runtime['path'])):
            raise Refused('Retained volume has a competing writer')

    def schema(self, runtime):
        path = backup.regular_path(Path(runtime['path']) / backup.DB)
        with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=1)) as db:
            db.execute('PRAGMA query_only=ON')
            db.execute('BEGIN')
            schema = db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").fetchall()
            if any(row[0] == 'trigger' for row in schema):
                raise Refused('Unreviewed SQLite triggers refused')
            migrations = db.execute('SELECT name,batch FROM payload_migrations ORDER BY id').fetchall()
            return hashlib.sha256(json.dumps([schema, migrations]).encode()).hexdigest()

    def prepare(self, production, staging, run, directory):
        archive = backup.backup(Path(production['path']), directory, run, runtime_stopped=True)['archive']
        return archive

    def restore(self, production, staging, state, directory):
        path = Path(staging['path']) / backup.DB
        with closing(sqlite3.connect(path)) as db:
            result = db.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone()
            if not result or result[0] or result[1] != result[2]:
                raise Refused('Staging WAL checkpoint failed')
        name = 'openship-mstefan-payload-preview-' + state['run_id']
        if name in self.docker('volume', 'ls', '--format', '{{.Name}}').decode().splitlines():
            raise Refused('Fresh volume name already exists; use exact-run recovery')
        self.docker('volume', 'create', name)
        root = self.volume(name)
        if any(root.iterdir()):
            raise Refused('Fresh target volume is not empty')
        staging_restore.restore(Path(state['archive']), root, path, state['run_id'], Path(production['path']), staging_stopped=True)
        for file in [root, *root.rglob('*')]:
            if file.is_symlink():
                raise Refused('Prepared symlink refused')
            os.chown(file, staging['uid'], staging['gid'])
        return {'volume': name, 'mount': state['run_id'] + ':/data', 'path': str(root)}


def accounts(path):
    with closing(sqlite3.connect((Path(path) / backup.DB).as_uri() + '?mode=ro', uri=True)) as db:
        db.execute('PRAGMA query_only=ON')
        db.execute('BEGIN')
        staging_restore.verify_database(db)
        staging_restore.user_schema(db)
        rows = db.execute('SELECT ' + ','.join(map(staging_restore.quote, staging_restore.PRESERVED)) + ' FROM users ORDER BY id').fetchall()
        if not rows:
            raise Refused('Staging has no dedicated accounts')
        return hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()


class Refresh:
    def __init__(self, client, host, sleep=time.sleep):
        self.client, self.host, self.sleep = client, host, sleep
        self.notion = Notion(client.notion)

    def project(self, identity):
        project = value(self.client.ship('GET', '/projects/' + identity))
        expected = {'id': identity, 'organizationId': ORG, 'slug': SLUGS[identity],
                    'gitProvider': 'github', 'gitOwner': 'Itakello', 'gitRepo': 'mstefan-dev', 'gitBranch': 'master',
                    'autoDeploy': False, 'routeStrategy': 'loopback-port'}
        servers = {SERVER, None} if identity == PROD else {SERVER}
        if project.get('serverId') not in servers or any(project.get(key) != expected_value for key, expected_value in expected.items()):
            raise Refused('Project identity, routing or deployment ownership changed')
        mounts = project.get('volumes')
        if identity == PROD and mounts != ['data:/data']:
            raise Refused('Production mounts changed')
        if identity == STAGE and (not isinstance(mounts, list) or len(mounts) != 1 or not re.fullmatch(r'(staging-data|refresh-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}):/data', mounts[0])):
            raise Refused('Staging isolated mount changed')
        return project

    def idle(self, identity):
        offset = 1
        while True:
            response = self.client.ship('GET', '/projects/' + identity + '/deployments?perPage=100&page=' + str(offset))
            rows = value(response)
            if not isinstance(rows, list) or not isinstance(response.get('total'), int) or len(rows) > 100:
                raise Refused('Deployment inventory incomplete')
            if any(row.get('projectId') != identity or row.get('status') not in TERMINAL for row in rows):
                raise Refused('Deployment pending, held or status unknown')
            if offset * 100 >= response['total']:
                break
            if not rows or offset >= 100:
                raise Refused('Deployment pagination incomplete')
            offset += 1

    def runtime(self, identity):
        project = self.project(identity)
        record = value(self.client.ship('GET', '/deployments/' + project['activeDeploymentId']))
        volume = VOLUME if identity == PROD else 'openship-mstefan-payload-preview-' + project['volumes'][0].split(':')[0]
        return self.host.runtime(project, record, volume)

    def plan(self):
        for identity in (PROD, STAGE):
            self.idle(identity)
        production, staging = self.runtime(PROD), self.runtime(STAGE)
        changed = self.client.compatible(production['commit'], staging['commit'])
        if changed:
            if any(path.startswith('migrations/') or path in {'Dockerfile', 'pnpm-lock.yaml'} or
                   any(word in Path(path).name.lower() for word in ('startup', 'entrypoint')) for path in changed):
                raise Refused('Migrations, resolved dependencies or startup changed; align Staging first')
            with private(COMPATIBILITY).open() as stream:
                receipt = json.load(stream)
            expected = {'production': {key: production[key] for key in ('commit', 'image')},
                        'staging': {key: staging[key] for key in ('commit', 'image')}, 'reviewed_paths': changed}
            if any(receipt.get(key) != item for key, item in expected.items()) or type(receipt.get('expires_at')) not in (int, float) or not time.time() < receipt['expires_at'] <= time.time() + 7 * 86400 or receipt.get('standards') != 'clean' or receipt.get('spec') != 'clean':
                raise Refused('Exact-version data compatibility needs a current independent review')
        signature = self.host.schema(production)
        if self.host.schema(staging) != signature:
            raise Refused('Production and Staging schemas or applied migrations differ')
        self.client.health()
        self.client.health(staging=True)
        notion = self.notion.plan()
        return {'production': production, 'staging': staging, 'schema': signature, 'notion_plan': notion}

    def phase(self, state, save_state, phase, **fields):
        state.update(phase=phase, **fields)
        save_state()

    def wait(self, state, save_state, baseline, mount):
        self.phase(state, save_state, 'submitting', submitted=None, native_pending=True, native_mount=mount)
        result = self.client.ship('POST', '/deployments', {'projectId': STAGE, 'environment': 'preview', 'refresh': True})
        identity = result.get('deployment_id')
        if not ID.fullmatch(str(identity)):
            raise Refused('Refresh submission result unknown; reconcile before recovery')
        self.phase(state, save_state, 'waiting', submitted=identity)
        deadline = time.monotonic() + 300
        while time.monotonic() < deadline:
            record = value(self.client.ship('GET', '/deployments/' + identity))
            if record.get('projectId') != STAGE or record.get('commitSha') != baseline['commit']:
                raise Refused('Refresh revision changed')
            if record.get('status') == 'ready':
                current = self.runtime(STAGE)
                if current['deployment'] != identity or current['image'] != baseline['image'] or current['volume'] != mount['volume'] or current['port'] != baseline['port']:
                    raise Refused('Refresh image, data mount or private route changed')
                state.update(native_pending=False, current=current)
                save_state()
                return current
            if record.get('status') in TERMINAL:
                raise Refused('Native refresh failed')
            self.sleep(3)
        raise Refused('Native refresh deadline exceeded; reconcile its exact deployment')

    def apply(self, state, directory, save_state):
        production, staging = state['production'], state['staging']
        try:
            self.phase(state, save_state, 'stopping_production')
            self.host.stop(production)
            if self.host.schema(production) != state['schema']:
                raise Refused('Production schema changed before snapshot')
            archive = self.host.prepare(production, staging, state['run_id'], directory)
            self.phase(state, save_state, 'restarting_production', archive=archive)
            self.host.restart(production)
            self.client.health()
            self.phase(state, save_state, 'stopping_staging')
            self.host.stop(staging)
            if self.host.schema(staging) != state['schema']:
                raise Refused('Staging schema changed before preparation')
            state['accounts'] = accounts(staging['path'])
            self.phase(state, save_state, 'preparing')
            target = self.host.restore(production, staging, state, directory)
            if self.host.schema({**staging, 'path': target['path']}) != state['schema']:
                raise Refused('Prepared schema or migrations differ')
            if accounts(target['path']) != state['accounts']:
                raise Refused('Dedicated account preservation failed')
            self.phase(state, save_state, 'reconciling_notion', target=target)
            self.notion.apply(state['notion_plan'], state, save_state)
            self.phase(state, save_state, 'switching_mount')
            self.client.ship('PATCH', '/projects/' + STAGE, {'volumes': [target['mount']]})
            if self.project(STAGE)['volumes'] != [target['mount']]:
                raise Refused('Mount update readback failed')
            current = self.wait(state, save_state, staging, target)
            self.phase(state, save_state, 'verifying', current=current)
            self.client.login()
            rendered = self.client.health(staging=True)
            if any(marker in rendered[locale] for locale in ('en', 'it') for marker in (
                    b'data-stack-publication-status="error"', b'data-stack-publication-status="unconfigured"')):
                raise Refused('Staging Stack publication is not ready')
            for dataset in state['notion_plan']['datasets']:
                if dataset['name'] in ('Projects', 'Stack'):
                    suffix = '/projects' if dataset['name'] == 'Projects' else ''
                    for name in dataset['source']:
                        if any(html.escape(name).encode() not in rendered[locale + suffix] for locale in ('en', 'it')):
                            raise Refused('Staging ' + dataset['name'] + ' render differs from copied dataset')
            with tarfile.open(state['archive'], 'r:') as bundle:
                manifest = json.load(bundle.extractfile(backup.MANIFEST))
            for name, digest in manifest['files'].items():
                if name != backup.DB and backup.digest(Path(target['path']) / name) != digest:
                    raise Refused('Copied upload changed after cutover')
            self.client.health()
            self.phase(state, save_state, 'ready', finished_at=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
        except BaseException:
            failure_phase = state['phase']
            self.phase(state, save_state, 'recovery_required', failure_phase=failure_phase)
            try:
                self.recover(state, save_state)
            except BaseException:
                self.phase(state, save_state, 'recovery_required')
            raise

    def recover(self, state, save_state):
        previous = state.get('failure_phase', state['phase'])
        production, staging = state['production'], state['staging']
        if previous in {'stopping_production', 'restarting_production'}:
            self.host.restart(production)
            self.client.health()
            self.phase(state, save_state, 'rolled_back')
            return
        if previous == 'planned':
            self.phase(state, save_state, 'rolled_back')
            return
        current = None
        if state.get('native_pending'):
            identity = state.get('submitted')
            if not ID.fullmatch(str(identity)):
                raise Refused('Unknown native submission requires operator reconciliation; no retry')
            record = value(self.client.ship('GET', '/deployments/' + identity))
            if record.get('projectId') != STAGE or record.get('commitSha') != staging['commit'] or record.get('status') not in TERMINAL:
                raise Refused('Submitted native refresh must reach a known terminal state before recovery')
            if record['status'] == 'ready':
                current = self.runtime(STAGE)
                if current['deployment'] != identity or current['image'] != staging['image'] or current['volume'] != state['native_mount']['volume'] or current['port'] != staging['port']:
                    raise Refused('Native outcome changed; attended recovery required')
                state.update(current=current, native_pending=False)
                save_state()
            elif self.host.writers(Path(state['target']['path'])):
                raise Refused('Failed native refresh still has a writer; attended recovery required')
            else:
                state['native_pending'] = False
                save_state()
        elif state.get('current'):
            if self.project(STAGE)['activeDeploymentId'] != state['current']['deployment']:
                raise Refused('Staging changed after cutover; attended recovery required')
            if self.host.inspect(state['current']['id'])['State'].get('Running'):
                current = self.runtime(STAGE)
                if current['id'] != state['current']['id']:
                    raise Refused('Staging changed after cutover; attended recovery required')
            else:
                self.host.stopped(state['current'])
                current = state['current']
        if current and current['volume'] == staging['volume'] and state.get('recovering'):
            self.client.login()
            self.client.health(staging=True)
            self.client.health()
            self.phase(state, save_state, 'rolled_back')
            return
        if current:
            if self.host.inspect(current['id'])['State'].get('Running'):
                self.host.stop(current)
        state['recovering'] = True
        save_state()
        if 'notion' in state:
            self.notion.rollback(state, save_state)
        mount = staging['volume'].removeprefix('openship-mstefan-payload-preview-') + ':/data'
        declared = self.project(STAGE)['volumes']
        if declared not in ([mount], [state.get('target', {}).get('mount')]):
            raise Refused('Project mount changed outside this refresh')
        if declared != [mount]:
            self.client.ship('PATCH', '/projects/' + STAGE,
                             {'volumes': [mount]})
        if current or state.get('submitted'):
            self.wait(state, save_state, staging, {'volume': staging['volume']})
        else:
            self.host.restart(staging)
        self.client.login()
        self.client.health(staging=True)
        self.client.health()
        self.phase(state, save_state, 'rolled_back')


def credentials(path):
    with private(path).open() as stream:
        data = json.load(stream)
    keys = {'openship', 'notion_source', 'notion_target', 'staging_email', 'staging_password'}
    if set(data) != keys or any(not isinstance(item, str) or not item or '\n' in item or '\r' in item for item in data.values()):
        raise Refused('Protected credential bundle invalid')
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('plan', 'apply', 'rollback'))
    parser.add_argument('--credentials-file', type=Path, required=True)
    parser.add_argument('--run-id')
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error('Run attended on the verified Docker host as root')
    if args.action == 'rollback' and not RUN.fullmatch(str(args.run_id)):
        parser.error('rollback requires the exact retained run ID')
    if args.action != 'rollback' and args.run_id:
        parser.error('Run IDs are generated for fresh snapshots; only rollback accepts --run-id')
    def interrupted(*_):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    try:
        lock_path = backup.regular_path(DEPLOY_LOCK)
        if lock_path.stat().st_mode & 0o022:
            raise Refused('Deployment lock is writable by another principal')
        with open(lock_path, 'r') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            refresh = Refresh(Client(credentials(args.credentials_file)), Host())
            if args.action == 'plan':
                plan = refresh.plan()
                print(json.dumps({'status': 'planned', 'staging_commit': plan['staging']['commit'],
                                  'production_commit': plan['production']['commit'], 'notion': plan['notion_plan']['summary']}))
                return 0
            STATE_ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
            private(STATE_ROOT, directory=True)
            if args.action == 'apply':
                for old in STATE_ROOT.glob('*/state.json'):
                    with private(old).open() as stream:
                        if json.load(stream).get('phase') not in {'ready', 'rolled_back'}:
                            raise Refused('An unfinished refresh requires exact-run recovery first')
                state = refresh.plan()
                state.update(run_id=time.strftime('refresh-%Y%m%dT%H%M%SZ-', time.gmtime()) + uuid.uuid4().hex[:8], phase='planned')
                directory = STATE_ROOT / state['run_id']
                directory.mkdir(mode=0o700)
            else:
                directory = private(STATE_ROOT / args.run_id, directory=True)
                with private(directory / 'state.json').open() as stream:
                    state = json.load(stream)
                if state.get('run_id') != args.run_id or state.get('phase') in {'ready', 'rolled_back'}:
                    raise Refused('Only unfinished exact-run recovery is supported')
            save_state = lambda: save(directory / 'state.json', state)
            if args.action == 'apply':
                save_state()
                refresh.apply(state, directory, save_state)
            else:
                refresh.recover(state, save_state)
            print(json.dumps({'status': state['phase'], 'run_id': state['run_id'], 'staging_commit': state['staging']['commit']}))
            return 0
    except BaseException as error:
        print(json.dumps({'status': 'refused' if 'state' not in locals() else state.get('phase', 'recovery_required'),
                          'run_id': locals().get('state', {}).get('run_id'),
                          'reason': str(error) if isinstance(error, Refused) else 'Refresh interrupted or failed; inspect protected recovery state'}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
