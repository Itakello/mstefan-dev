#!/usr/bin/env python3
"""Fail-closed, one-project release controller; installation is explicitly gated."""
import argparse
import fcntl
import json
import math
import os
import re
import socket
import stat
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

import release_observations

REPO = 'Itakello/mstefan-dev'
PROJECT = 'proj_w1kqcgR7eY2EZhht'
VOLUME = 'openship-mstefan-payload-data'
CONTAINER_PREFIX = 'openship-mstefan-payload-'
DECLARED_MOUNTS = ['data:/data']
ACTIVATION = Path('/etc/mstefan-event-deploy/activation.json')
PROBE_SOCKET = '/run/mstefan-event-deploy-probe.sock'
PROBE_LIMIT = 32 * 1024
SHA = re.compile(r'^[0-9a-f]{40}$')
DEPLOYMENT = re.compile(r'^dep_[A-Za-z0-9_-]+$')
LIMIT = 40 * 60
PUBLIC = tuple('/' + locale + suffix for locale in ('en', 'it') for suffix in ('', '/projects', '/about'))
PRIVATE = ('/admin', '/admin/login', '/api/users', '/api/users/first-register', '/api/globals/about?draft=true',
           '/api/globals/career?draft=true', '/api/globals/about/versions', '/api/graphql',
           '/en?preview=1', '/it?preview=1', '/en/about?preview=1', '/it/about?preview=1',
           '/en/about?preview=1&previewSource=career')
FAILURES = {'failed', 'failure', 'cancelled', 'canceled', 'partial_failure', 'action_required', 'rejected'}
PENDING = {'pending', 'queued', 'building', 'deploying', 'in_progress', 'running', 'reconciling'}


class Blocked(Exception):
    pass


class Refused(Blocked):
    pass


class Superseded(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise Blocked('HTTP redirect refused')


def field(value, *names):
    if isinstance(value, dict):
        for source in (value, value.get('data', {})):
            if isinstance(source, dict):
                for name in names:
                    if name in source:
                        return source[name]
    raise Blocked('API field missing: ' + names[0])


def protected(path):
    parts = path.lower().split('/')
    return (path in {'package.json', 'pnpm-lock.yaml', 'payload.config.ts', 'Dockerfile',
                     '.dockerignore', 'tsconfig.json', 'next.config.mjs',
                     'lib/i18n/copy.ts', 'lib/i18n/config.ts', 'scripts/baseline-payload-preview.mjs'}
            or path.startswith(('payload/', 'app/(payload)/'))
            or (path.startswith('deploy/payload-') and parts[-1] in {'dockerfile', 'compose.yaml', 'compose.yml', 'entrypoint.sh', 'startup.sh'})
            or any(part in {'migrations', 'collections', 'globals', 'schema', 'schemas'} for part in parts)
            or any(word in parts[-1] for word in ('dockerfile', 'startup', 'entrypoint', 'payload.config')))


def tree_identity(response):
    if response.get('truncated') is not False or not isinstance(response.get('tree'), list):
        raise Blocked('Git tree incomplete')
    entries = {}
    for item in response['tree']:
        if not isinstance(item, dict) or not isinstance(item.get('path'), str):
            raise Blocked('Git tree invalid')
        if protected(item['path']):
            if item['path'] in entries or item.get('type') not in {'tree', 'blob'} or not SHA.fullmatch(str(item.get('sha', ''))):
                raise Blocked('Git tree identity invalid')
            entries[item['path']] = (item['type'], item.get('mode'), item['sha'])
    return entries


class Client:
    def __init__(self, env):
        self.github = env.get('GITHUB_TOKEN', '')
        self.openship = env['OPENSHIP_TOKEN']

    def request(self, method, url, token=None, body=None, status_only=False):
        headers = {'Accept': 'application/json', 'User-Agent': 'mstefan-event-deploy/1'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        data = None if body is None else json.dumps(body).encode()
        if data is not None:
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect).open(request, timeout=12) as response:
                if status_only:
                    return response.status
                raw = response.read(1024 * 1024 + 1)
                if len(raw) > 1024 * 1024:
                    raise Blocked('API response too large')
                return json.loads(raw)
        except urllib.error.HTTPError as error:
            if status_only and error.code == 404:
                return 404
            raise Blocked('HTTP request failed: ' + method + ' status ' + str(error.code)) from None
        except (urllib.error.URLError, ValueError, TimeoutError):
            raise Blocked('HTTP request failed: ' + method) from None

    def gh(self, path):
        return self.request('GET', 'https://api.github.com/repos/' + REPO + path, self.github)

    def ship(self, method, path, body=None):
        return self.request(method, 'http://127.0.0.1:4000' + path, self.openship, body)

    def current_master(self, sha):
        if field(field(self.gh('/git/ref/heads/master'), 'object'), 'sha') != sha:
            raise Superseded('event SHA is no longer current master')

    def gate(self, sha, run_id):
        self.current_master(sha)
        run = self.gh('/actions/runs/' + str(run_id))
        expected = {'id': run_id, 'head_sha': sha, 'head_branch': 'master', 'event': 'push', 'status': 'completed', 'conclusion': 'success', 'path': '.github/workflows/ci.yml'}
        if any(run.get(key) != value for key, value in expected.items()) or field(field(run, 'repository'), 'full_name') != REPO or field(field(run, 'head_repository'), 'full_name') != REPO:
            raise Blocked('CI run identity or result mismatch')
        response = self.gh('/actions/runs/' + str(run_id) + '/jobs?filter=latest&per_page=100')
        jobs = field(response, 'jobs')
        if not isinstance(jobs, list) or field(response, 'total_count') != len(jobs) or len(jobs) > 100:
            raise Blocked('CI jobs incomplete')
        names = [job.get('name') for job in jobs if isinstance(job, dict)]
        if len(names) != len(jobs) or set(names) != {'project-technologies', 'verify', 'policy-gate', 'docs-workflow-integrity'} or len(names) != len(set(names)):
            raise Blocked('unexpected CI job set')
        for job in jobs:
            if job['name'] in {'policy-gate', 'docs-workflow-integrity'} and any(job.get(key) != value for key, value in {'run_id': run_id, 'head_sha': sha, 'status': 'completed', 'conclusion': 'skipped'}.items()):
                raise Blocked('PR-only CI job identity or skip mismatch')
        for name in ('project-technologies', 'verify'):
            matches = [job for job in jobs if isinstance(job, dict) and job.get('name') == name]
            if len(matches) != 1 or any(matches[0].get(key) != value for key, value in {'run_id': run_id, 'head_sha': sha, 'status': 'completed', 'conclusion': 'success'}.items()):
                raise Blocked('required CI job missing, failed or mismatched')

    def baseline(self):
        project = self.ship('GET', '/api/projects/' + PROJECT)
        deployment_id = field(project, 'activeDeploymentId', 'active_deployment_id')
        if not DEPLOYMENT.fullmatch(str(deployment_id)):
            raise Blocked('active deployment invalid')
        record = self.record(deployment_id)
        sha = field(record, 'commitSha', 'commit_sha')
        if not SHA.fullmatch(str(sha)):
            raise Blocked('active commit invalid')
        return {'id': deployment_id, 'sha': sha}

    def record(self, deployment_id, sha=None):
        record = self.ship('GET', '/api/deployments/' + deployment_id)
        if field(record, 'projectId', 'project_id') != PROJECT or (sha and field(record, 'commitSha', 'commit_sha') != sha):
            raise Blocked('deployment identity mismatch')
        return record

    def compatible(self, baseline, sha):
        old = tree_identity(self.gh('/git/trees/' + baseline['sha'] + '?recursive=1'))
        new = tree_identity(self.gh('/git/trees/' + sha + '?recursive=1'))
        if old != new:
            raise Blocked('schema, dependency or startup change requires attended compatibility and restore proof')

    def project_config(self):
        response = self.ship('GET', '/api/projects/' + PROJECT)
        project = response.get('data') if isinstance(response, dict) else None
        expected = {'id': PROJECT, 'gitOwner': 'Itakello', 'gitRepo': 'mstefan-dev', 'gitProvider': 'github',
                    'gitBranch': 'master', 'autoDeploy': False, 'slug': 'mstefan-payload',
                    'routeStrategy': 'loopback-port', 'volumes': DECLARED_MOUNTS}
        if not isinstance(project, dict) or any(type(project.get(key)) is not type(value) or project[key] != value for key, value in expected.items()):
            raise Blocked('live project identity, routing or declared mounts changed')

    def activation(self, attestation, now):
        activation_config(attestation, now)
        self.project_config()

    def probe(self):
        try:
            metadata = os.lstat(PROBE_SOCKET)
            if not stat.S_ISSOCK(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_mode & 0o007:
                raise Blocked('unsafe volume probe socket')
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as stream:
                stream.settimeout(12)
                stream.connect(PROBE_SOCKET)
                stream.shutdown(socket.SHUT_WR)
                raw = bytearray()
                while True:
                    chunk = stream.recv(min(4096, PROBE_LIMIT + 1 - len(raw)))
                    if not chunk:
                        break
                    raw.extend(chunk)
                    if len(raw) > PROBE_LIMIT:
                        raise Blocked('volume probe response too large')
                return json.loads(raw)
        except (OSError, ValueError):
            raise Blocked('volume probe unavailable or invalid') from None

    def volume_writer(self, deployment_id, attestation):
        storage_config(attestation)
        response = self.probe()
        if not isinstance(response, dict) or set(response) != {'ok', 'volume', 'count', 'users'} or response['ok'] is not True or response['volume'] != VOLUME or type(response['count']) is not int or response['count'] != 1 or not isinstance(response['users'], list) or len(response['users']) != 1:
            raise Blocked('volume probe did not establish one writer')
        user = response['users'][0]
        if not isinstance(user, dict) or set(user) != {'id', 'name', 'status', 'destination', 'rw', 'mount_type'} or not re.fullmatch('[0-9a-f]{64}', str(user['id'])) or user['name'] != CONTAINER_PREFIX + deployment_id or user['status'] != 'running' or user['destination'] != '/data' or user['rw'] is not True or user['mount_type'] != 'volume':
            raise Blocked('volume writer identity or mount mismatch')

    def submit(self, sha):
        result = self.ship('POST', '/api/deployments', {'projectId': PROJECT, 'branch': 'master', 'commitSha': sha, 'environment': 'production'})
        deployment_id = field(result, 'deployment_id')
        if not DEPLOYMENT.fullmatch(str(deployment_id)):
            raise Blocked('submitted deployment ID invalid')
        return deployment_id

    def observe(self, deployment_id, sha):
        record = self.record(deployment_id, sha)
        build = self.ship('GET', '/api/deployments/' + deployment_id + '/build')
        durable, runtime, status = field(record, 'status'), field(build, 'deploymentStatus'), field(build, 'status')
        if any(value in FAILURES for value in (durable, runtime, status)):
            raise Blocked('deployment failed')
        if any(value not in PENDING | {'ready', 'no_changes'} for value in (durable, runtime, status)):
            raise Blocked('unknown deployment status')
        return durable == runtime and durable in {'ready', 'no_changes'} and status == 'ready'

    def smoke(self, deployment_id, sha, attestation):
        self.project_config()
        if self.baseline() != {'id': deployment_id, 'sha': sha}:
            raise Blocked('active deployment or commit mismatch')
        self.volume_writer(deployment_id, attestation)
        for path, expected in [(path, 200) for path in PUBLIC] + [(path, 404) for path in PRIVATE]:
            if self.request('GET', 'https://www.mstefan.dev' + path, status_only=True) != expected:
                raise Blocked('public health or privacy check failed')
        if self.baseline() != {'id': deployment_id, 'sha': sha}:
            raise Blocked('active deployment changed during health checks')
        self.volume_writer(deployment_id, attestation)


def storage_config(attestation):
    expected = {'project_id': PROJECT, 'repository': REPO, 'declared_mounts': DECLARED_MOUNTS,
                'docker_volume': VOLUME, 'container_prefix': CONTAINER_PREFIX}
    if not isinstance(attestation, dict) or any(type(attestation.get(key)) is not type(value) or attestation[key] != value for key, value in expected.items()):
        raise Blocked('activation project or storage identity invalid')


def activation_config(attestation, now):
    storage_config(attestation)
    expiry = attestation.get('expires_at')
    if type(expiry) not in {int, float} or not math.isfinite(expiry) or not now < expiry:
        raise Blocked('activation expiry invalid')
    for proof in ('native_stop_first_verified', 'retained_image_verified', 'isolated_restore_verified', 'installed_api_verified'):
        if attestation.get(proof) is not True:
            raise Blocked('activation proof missing: ' + proof)
    if not isinstance(attestation.get('installed_api_revision'), str) or not attestation['installed_api_revision']:
        raise Blocked('installed API revision missing')
    if not isinstance(attestation.get('host_mount_namespace'), str) or not re.fullmatch(r'mnt:\[[1-9][0-9]*\]', attestation['host_mount_namespace']):
        raise Blocked('attested host mount namespace missing or invalid')


def read_activation(path=ACTIVATION):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor) as stream:
        metadata = os.fstat(stream.fileno())
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_mode & 0o022 or metadata.st_size > PROBE_LIMIT:
            raise Blocked('activation must be a bounded root-owned non-writable regular file')
        return json.load(stream)


def save(path, state):
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix='.state-')
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w') as stream:
            json.dump(state, stream, sort_keys=True)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def load(path):
    if not path.exists():
        return {'phase': 'idle', 'failed_shas': []}
    if path.is_symlink() or path.stat().st_mode & 0o077:
        raise Blocked('unsafe state file')
    state = json.loads(path.read_text())
    if not isinstance(state, dict) or state.get('phase') not in {'idle', 'prepared', 'submit_unknown', 'observing', 'smoke', 'paused'} or not isinstance(state.get('failed_shas'), list):
        raise Blocked('invalid durable state')
    return state


def release_ledger():
    return os.environ.get('MSTEFAN_RELEASE_OBSERVATIONS')


def register_release_ledger(state, path):
    configured = release_ledger()
    bound = state.get('release_observation_ledger')
    if bound is not None:
        if not isinstance(bound, str) or not Path(bound).is_absolute():
            raise Blocked('invalid release observation binding')
        try:
            status = release_observations.capture_state(bound)
            if configured != bound:
                if status == 'ready':
                    release_observations.pause(bound)
                raise Blocked('release observation path changed or disabled')
            if status == 'paused' or (status == 'pending' and state['phase'] in {'idle', 'prepared'}):
                raise Blocked('release observation state requires reconciliation')
        except (OSError, release_observations.ObservationError):
            raise Blocked('release observation binding unavailable') from None
        return
    if not configured:
        return
    if state['phase'] != 'idle' or not Path(configured).is_absolute():
        raise Blocked('release observation binding requires idle controller and absolute path')
    try:
        if release_observations.capture_state(configured) != 'ready':
            raise Blocked('release observation ledger not ready')
    except (OSError, release_observations.ObservationError):
        raise Blocked('release observation binding unavailable') from None
    state['release_observation_ledger'] = configured
    save(path, state)


def mark_release_pending():
    ledger = release_ledger()
    if ledger:
        try:
            release_observations.mark_pending(ledger)
        except (OSError, release_observations.ObservationError):
            raise Blocked('release observation admission failed') from None


def capture_release(client, state, path):
    pending = state.get('release_observation_pending')
    if not pending:
        return
    ledger = release_ledger()
    if not ledger or pending.get('id') != state.get('deployment_id') or pending.get('sha') != state.get('sha'):
        raise Blocked('release observation marker mismatch')
    try:
        release_observations.record(ledger, client, pending['id'], pending['sha'],
                                    pending['baselineSha'], pending['deployedAt'])
    except (OSError, release_observations.ObservationError):
        raise Blocked('release observation capture failed') from None
    state.pop('release_observation_pending')
    save(path, state)


def tick(client, state, path, sha, run_id, attestation, now):
    register_release_ledger(state, path)
    if state['phase'] == 'paused':
        raise Refused('controller paused; attended reconciliation required')
    if state['phase'] == 'submit_unknown':
        raise Refused('submission unknown; replay refused')
    if state['phase'] != 'idle' and (state.get('sha') != sha or state.get('run_id') != run_id):
        raise Refused('unfinished release requires original event reconciliation')
    if state['phase'] != 'idle' and now >= state['deadline']:
        raise Blocked('deployment deadline exceeded')
    if state['phase'] == 'idle':
        if sha in state['failed_shas']:
            raise Blocked('failed SHA cannot retry unattended')
        client.gate(sha, run_id)
        client.activation(attestation, now)
        baseline = client.baseline()
        client.volume_writer(baseline['id'], attestation)
        if baseline['sha'] == sha:
            client.smoke(baseline['id'], sha, attestation)
            state.update(last_success=sha, last_deployment=baseline['id'])
            save(path, state)
            return
        client.compatible(baseline, sha)
        state.update(phase='prepared', sha=sha, run_id=run_id, baseline=baseline, deadline=now + LIMIT)
        save(path, state)
    elif state['phase'] == 'prepared':
        client.gate(sha, run_id)
        client.activation(attestation, now)
        if client.baseline() != state['baseline']:
            raise Blocked('active baseline changed before submission')
        client.volume_writer(state['baseline']['id'], attestation)
        if client.baseline() != state['baseline']:
            raise Blocked('active baseline changed during writer verification')
        client.current_master(sha)
        mark_release_pending()
        state['phase'] = 'submit_unknown'
        save(path, state)
        deployment_id = client.submit(sha)
        state.update(phase='observing', deployment_id=deployment_id)
        save(path, state)
    elif state['phase'] == 'observing':
        if client.observe(state['deployment_id'], sha):
            if release_ledger():
                if client.baseline() != {'id': state['deployment_id'], 'sha': sha}:
                    raise Blocked('active release identity mismatch before capture')
                state['release_observation_pending'] = {
                    'id': state['deployment_id'], 'sha': sha,
                    'baselineSha': state['baseline']['sha'],
                    'deployedAt': release_observations.now_utc(),
                }
            state['phase'] = 'smoke'
            save(path, state)
    elif state['phase'] == 'smoke':
        capture_release(client, state, path)
        client.smoke(state['deployment_id'], sha, attestation)
        state.update(phase='idle', last_success=sha, last_deployment=state['deployment_id'])
        save(path, state)


def run(client, state, path, sha, run_id, attestation, clock=time.time, sleep=time.sleep):
    try:
        while True:
            previous = state['phase']
            tick(client, state, path, sha, run_id, attestation, clock())
            if state['phase'] == 'idle':
                return 'verified'
            if previous == state['phase']:
                sleep(10)
    except Superseded:
        state.update(phase='idle')
        for key in ('sha', 'run_id', 'baseline', 'deadline', 'deployment_id'):
            state.pop(key, None)
        save(path, state)
        return 'superseded'
    except Refused:
        raise
    except (Blocked, KeyError, TypeError, ValueError, OSError) as error:
        if sha not in state['failed_shas']:
            state['failed_shas'].append(sha)
        state.update(failure_phase=state['phase'], phase='paused', reason=str(error) if isinstance(error, Blocked) else 'invalid configuration, state or local persistence')
        save(path, state)
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('sha')
    parser.add_argument('run_id', type=int)
    args = parser.parse_args()
    if not SHA.fullmatch(args.sha) or args.run_id <= 0:
        parser.error('invalid event identity')
    path = Path('/var/lib/mstefan-event-deploy/state.json')
    try:
        attestation = read_activation()
        with open(path.parent / 'controller.lock', 'a+') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            state = load(path)
            result = run(Client(os.environ), state, path, args.sha, args.run_id, attestation)
    except BlockingIOError:
        print('mstefan deployment already running', file=sys.stderr)
        return 1
    except (Blocked, KeyError, TypeError, ValueError, OSError):
        print('mstefan deployment blocked; inspect protected state and provider evidence', file=sys.stderr)
        return 1
    print(('mstefan event skipped: superseded ' if result == 'superseded' else 'mstefan deployment verified: ') + args.sha)
    return 0


if __name__ == '__main__':
    sys.exit(main())
