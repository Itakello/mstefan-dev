#!/usr/bin/env python3
"""Fail-closed, one-project release controller; installation is explicitly gated."""
import argparse
import fcntl
import json
import math
import os
import re
import stat
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = 'Itakello/mstefan-dev'
PROJECT = 'proj_w1kqcgR7eY2EZhht'
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
        self.github = env['GITHUB_TOKEN']
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

    def activation(self, attestation, now):
        if attestation.get('project_id') != PROJECT or attestation.get('repository') != REPO or not isinstance(attestation.get('expires_at'), (int, float)) or isinstance(attestation['expires_at'], bool) or not math.isfinite(attestation['expires_at']) or not now < attestation['expires_at']:
            raise Blocked('activation identity or expiry invalid')
        for proof in ('native_stop_first_verified', 'retained_image_verified', 'isolated_restore_verified', 'installed_api_verified'):
            if attestation.get(proof) is not True:
                raise Blocked('activation proof missing: ' + proof)
        if not isinstance(attestation.get('installed_api_revision'), str) or not attestation['installed_api_revision']:
            raise Blocked('installed API revision missing')
        checks = attestation.get('live_project_checks')
        if not isinstance(checks, dict) or set(checks) != {'routing', 'volume_target', 'volume_source', 'writers'}:
            raise Blocked('live configuration checks missing')
        project = self.ship('GET', '/api/projects/' + PROJECT)
        required = {'routing': 'loopback-port', 'volume_target': '/data', 'writers': 1}
        for name, check in checks.items():
            if not isinstance(check, dict) or not isinstance(check.get('path'), list) or not check['path'] or not all((isinstance(key, str) and bool(key)) or (type(key) is int and key >= 0) for key in check['path']):
                raise Blocked('activation field path invalid')
            expected = check.get('value')
            if name in required and (type(expected) is not type(required[name]) or expected != required[name]):
                raise Blocked('unsafe activation configuration')
            if name == 'volume_source' and (not isinstance(expected, str) or not expected):
                raise Blocked('persistent volume identity missing')
            value = project
            for key in check['path']:
                if isinstance(value, dict) and isinstance(key, str) and key in value:
                    value = value[key]
                elif isinstance(value, list) and type(key) is int and 0 <= key < len(value):
                    value = value[key]
                else:
                    raise Blocked('verified live configuration field unavailable')
            if type(value) is not type(expected) or value != expected:
                raise Blocked('live configuration changed since activation proof')

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

    def smoke(self, deployment_id, sha):
        if self.baseline() != {'id': deployment_id, 'sha': sha}:
            raise Blocked('active deployment or commit mismatch')
        for path, expected in [(path, 200) for path in PUBLIC] + [(path, 404) for path in PRIVATE]:
            if self.request('GET', 'https://www.mstefan.dev' + path, status_only=True) != expected:
                raise Blocked('public health or privacy check failed')
        if self.baseline() != {'id': deployment_id, 'sha': sha}:
            raise Blocked('active deployment changed during health checks')


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


def tick(client, state, path, sha, run_id, attestation, now):
    if state['phase'] == 'paused':
        raise Blocked('controller paused; attended reconciliation required')
    if state['phase'] == 'submit_unknown':
        raise Blocked('submission unknown; replay refused')
    if state['phase'] != 'idle' and (state.get('sha') != sha or state.get('run_id') != run_id):
        raise Blocked('unfinished release requires original event reconciliation')
    if state['phase'] != 'idle' and now >= state['deadline']:
        raise Blocked('deployment deadline exceeded')
    if state['phase'] == 'idle':
        if sha in state['failed_shas']:
            raise Blocked('failed SHA cannot retry unattended')
        client.gate(sha, run_id)
        client.activation(attestation, now)
        baseline = client.baseline()
        if baseline['sha'] == sha:
            client.smoke(baseline['id'], sha)
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
        client.current_master(sha)
        state['phase'] = 'submit_unknown'
        save(path, state)
        deployment_id = client.submit(sha)
        state.update(phase='observing', deployment_id=deployment_id)
        save(path, state)
    elif state['phase'] == 'observing':
        if client.observe(state['deployment_id'], sha):
            state['phase'] = 'smoke'
            save(path, state)
    elif state['phase'] == 'smoke':
        client.smoke(state['deployment_id'], sha)
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
    except (Blocked, KeyError, TypeError, ValueError, OSError) as error:
        if sha not in state['failed_shas']:
            state['failed_shas'].append(sha)
        state.update(phase='paused', reason=str(error) if isinstance(error, Blocked) else 'invalid configuration, state or local persistence')
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
    attestation_path = Path('/etc/mstefan-event-deploy/activation.json')
    try:
        metadata = attestation_path.lstat()
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_mode & 0o022:
            raise Blocked('activation must be a root-owned non-writable regular file')
        attestation = json.loads(attestation_path.read_text())
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
