"""Synthetic acceptance checks: no Docker, provider, or real credential access."""
import copy
import io
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import time
import unittest
import urllib.error
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import backup
import staging_refresh as refresh
import staging_restore
import test_staging_restore as restore_tests

RUN = 'refresh-20261011T120000Z-12345678'
COMMIT = 'a' * 40


class Injected(RuntimeError):
    pass


class Fault:
    def __init__(self, at=None):
        self.at = at
        self.events = []
        self.sequence = []

    def hit(self, event):
        self.events.append(event)
        if self.at == event or self.sequence and self.sequence[0] == event:
            self.at = None
            if self.sequence and self.sequence[0] == event:
                self.sequence.pop(0)
            raise Injected(event)


class SyntheticHost:
    """Real backup/SQLite restore; only runtime orchestration is synthetic."""
    def __init__(self, fixture, fault):
        self.fixture, self.fault = fixture, fault
        self.running = {'production': True, 'staging': True}
        self.paths = {refresh.VOLUME: fixture.prod,
                      'openship-mstefan-payload-preview-staging-data': fixture.staging}
        self.deployments = {'dep_prod': 'production', 'dep_old': 'staging'}

    def runtime(self, project, record, volume):
        identity = record['id']
        return {'id': self.deployments[identity], 'container': identity,
                'image': 'sha256:synthetic', 'commit': COMMIT,
                'deployment': identity, 'volume': volume, 'path': str(self.paths[volume]),
                'restart': {'Name': 'unless-stopped'}, 'port': '3001',
                'uid': os.getuid(), 'gid': os.getgid()}

    def stop(self, runtime):
        self.running[runtime['id']] = False
        self.fault.hit('stop:' + runtime['id'])

    def restart(self, runtime):
        self.running[runtime['id']] = True
        self.fault.hit('restart:' + runtime['id'])

    def inspect(self, identity):
        return {'State': {'Running': self.running[identity]}}

    def stopped(self, runtime):
        if self.running[runtime['id']]:
            raise AssertionError('Expected stopped retained runtime')

    def schema(self, runtime):
        return refresh.Host.schema(self, runtime)

    def prepare(self, production, staging, run, directory):
        self.fault.hit('backup:before')
        archive = backup.backup(Path(production['path']), directory, run, True)['archive']
        self.fault.hit('backup:after')
        return archive

    def restore(self, production, staging, state, directory):
        self.fault.hit('restore:before')
        staging_restore.restore(Path(state['archive']), self.fixture.target,
                                self.fixture.staging / backup.DB, state['run_id'], self.fixture.prod, True)
        volume = 'openship-mstefan-payload-preview-' + state['run_id']
        self.paths[volume] = self.fixture.target
        self.fault.hit('restore:after')
        return {'volume': volume, 'mount': state['run_id'] + ':/data', 'path': str(self.fixture.target)}

    def writers(self, root):
        return [identity for identity, running in self.running.items()
                if running and identity.startswith('native') and self.paths.get(self.native_volume) == root]


class SyntheticClient:
    def __init__(self, host, fault):
        self.host, self.fault = host, fault
        self.calls = []
        self.projects = {}
        self.records = {}
        for identity, deployment, mount in ((refresh.PROD, 'dep_prod', 'data:/data'),
                                            (refresh.STAGE, 'dep_old', 'staging-data:/data')):
            self.projects[identity] = {'id': identity, 'activeDeploymentId': deployment,
                'organizationId': refresh.ORG, 'slug': refresh.SLUGS[identity],
                'serverId': refresh.SERVER, 'gitProvider': 'github', 'gitOwner': 'Itakello',
                'gitRepo': 'mstefan-dev', 'gitBranch': 'master', 'autoDeploy': False,
                'routeStrategy': 'loopback-port', 'volumes': [mount]}
            self.records[deployment] = {'id': deployment, 'projectId': identity,
                                       'commitSha': COMMIT, 'status': 'ready'}

    def ship(self, method, path, body=None):
        self.calls.append((method, path, copy.deepcopy(body)))
        if method == 'PATCH':
            self.projects[refresh.STAGE].update(copy.deepcopy(body))
            self.fault.hit('mount:after')
            return {'data': self.projects[refresh.STAGE]}
        if method == 'POST':
            self.fault.hit('submission:unknown')
            identity = 'dep_native' + str(len(self.records))
            runtime = 'native' + identity
            self.records[identity] = {'id': identity, 'projectId': refresh.STAGE,
                                      'commitSha': COMMIT, 'status': 'ready'}
            self.projects[refresh.STAGE]['activeDeploymentId'] = identity
            self.host.deployments[identity] = runtime
            self.host.running[runtime] = True
            self.host.native_volume = ('openship-mstefan-payload-preview-' +
                                      self.projects[refresh.STAGE]['volumes'][0].split(':')[0])
            return {'deployment_id': identity}
        if path.startswith('/projects/') and '/deployments?' in path:
            identity = path.split('/')[2]
            rows = [copy.deepcopy(row) for row in self.records.values() if row['projectId'] == identity]
            return {'data': rows, 'total': len(rows)}
        if path.startswith('/projects/'):
            return {'data': copy.deepcopy(self.projects[path.split('/')[-1]])}
        self.fault.hit('deployment:read')
        return {'data': copy.deepcopy(self.records[path.split('/')[-1]])}

    def notion(self, *args):
        raise AssertionError('Unexpected provider call')

    def compatible(self, *args):
        self.fault.hit('compatible')

    def health(self, staging=False):
        self.fault.hit('health:staging' if staging else 'health:production')
        return {locale + suffix: b'Example &amp; project Example Stack' for locale in ('en', 'it')
                for suffix in ('', '/projects', '/about')}

    def login(self):
        self.fault.hit('signin')


class SyntheticNotion:
    def __init__(self, fault):
        self.fault = fault

    def plan(self):
        return {'datasets': [{'name': 'Projects', 'source': ['Example & project']},
                             {'name': 'Stack', 'source': ['Example Stack']}], 'summary': {}}

    def apply(self, plan, state, save):
        state['notion'] = {'applied': True}
        save()
        self.fault.hit('notion:after')

    def rollback(self, state, save):
        self.fault.hit('notion:rollback')
        state['notion']['rolled_back'] = True
        save()


class RefreshLifecycleTests(unittest.TestCase):
    def setUp(self):
        # Reuse migration-backed fixtures without inheriting unrelated test methods.
        self.fixture = restore_tests.StagingRestoreTests(methodName='runTest')
        self.fixture.setUp()
        self.fault = Fault()
        self.host = SyntheticHost(self.fixture, self.fault)
        self.client = SyntheticClient(self.host, self.fault)
        self.runner = refresh.Refresh(self.client, self.host, sleep=lambda _: None)
        self.runner.notion = SyntheticNotion(self.fault)
        self.state = self.runner.plan()
        self.state.update(run_id=RUN, phase='planned')
        self.saved = []
        self.before = self.fixture.fingerprint()

    def tearDown(self):
        self.fixture.tearDown()

    def save(self):
        refresh.save(self.fixture.output / 'state.json', self.state)
        self.saved.append(copy.deepcopy(self.state))

    def apply(self):
        self.runner.apply(self.state, self.fixture.output, self.save)

    def assert_original_data(self):
        current = self.fixture.fingerprint()
        for name, digest in self.before.items():
            self.assertEqual(current[name], digest, name)

    def test_success_real_snapshot_uploads_and_dedicated_accounts(self):
        self.apply()
        self.assertEqual(self.state['phase'], 'ready')
        self.assertTrue(self.host.running['production'])
        self.assertFalse(self.host.running['staging'])
        with sqlite3.connect(self.fixture.target / backup.DB) as db:
            self.assertEqual(db.execute('SELECT title FROM content').fetchall(), [('production editable content',)])
            self.assertEqual(db.execute('SELECT email,hash FROM users').fetchall(),
                             [('staging@example.test', 'staging-hash')])
        self.assertEqual(refresh.accounts(self.fixture.target), refresh.accounts(self.fixture.staging))
        self.assert_original_data()
        self.assertEqual(len([call for call in self.client.calls if call[0] == 'POST']), 1)

    def test_restart_waits_for_transient_gateway_failures(self):
        failures = [refresh.Refused('HTTP GET failed with status 502'),
                    refresh.Refused('HTTP GET failed with status 503'), {}]
        with patch.object(self.client, 'health', side_effect=failures) as health, \
                patch.object(self.runner, 'sleep') as sleep:
            self.runner.ready_health()
        self.assertEqual(health.call_count, 3)
        self.assertEqual(sleep.call_count, 2)

    def test_apply_survives_production_startup_gateway_failure(self):
        original = self.client.health
        failures = []
        def health(staging=False):
            if not staging and self.state['phase'] == 'restarting_production' and not failures:
                failures.append(True)
                raise refresh.Refused('HTTP GET failed with status 502')
            return original(staging=staging)
        with patch.object(self.client, 'health', side_effect=health):
            self.apply()
        self.assertEqual(failures, [True])
        self.assertEqual(self.state['phase'], 'ready')
        self.assert_original_data()

    def test_restart_health_deadline_and_access_refusal(self):
        for reason, clock in [('HTTP GET failed with status 502', [0, 60]),
                              ('HTTP GET failed with status 403', [0])]:
            with self.subTest(reason=reason), \
                    patch.object(self.client, 'health', side_effect=refresh.Refused(reason)), \
                    patch.object(refresh.time, 'monotonic', side_effect=clock), \
                    patch.object(self.runner, 'sleep') as sleep:
                with self.assertRaisesRegex(refresh.Refused, reason):
                    self.runner.ready_health(staging=True)
                sleep.assert_not_called()

    def test_failures_restore_original_runtime_and_declared_mount(self):
        for event in ('stop:production', 'backup:before', 'backup:after', 'restart:production',
                      'stop:staging', 'restore:before', 'restore:after', 'notion:after', 'mount:after'):
            with self.subTest(event=event):
                self.fault.at = event
                with self.assertRaisesRegex(Injected, event):
                    self.apply()
                self.assertEqual(self.state['phase'], 'rolled_back')
                self.assertTrue(self.host.running['production'])
                self.assertTrue(self.host.running['staging'])
                self.assertEqual(self.client.projects[refresh.STAGE]['volumes'], ['staging-data:/data'])
                self.assert_original_data()
                # Each iteration gets an independent empty target and fresh state.
                if event != 'mount:after':
                    self.tearDown()
                    self.setUp()

    def test_signin_failure_after_cutover_recovers_through_native_refresh(self):
        self.fault.at = 'signin'
        with self.assertRaisesRegex(Injected, 'signin'):
            self.apply()
        self.assertEqual(self.state['phase'], 'rolled_back')
        self.assertTrue(self.host.running['production'])
        self.assertEqual(self.client.projects[refresh.STAGE]['volumes'], ['staging-data:/data'])
        self.assertEqual(len([call for call in self.client.calls if call[0] == 'POST']), 2)
        self.assert_original_data()

    def test_stack_error_with_successful_http_response_rolls_back(self):
        original = self.client.health
        def health(staging=False):
            pages = original(staging)
            if staging:
                pages['it'] += b' data-stack-publication-status="error"'
            return pages
        self.client.health = health
        with self.assertRaisesRegex(refresh.Refused, 'Stack publication'):
            self.apply()
        self.assertEqual(self.state['phase'], 'rolled_back')
        self.assertEqual(self.client.projects[refresh.STAGE]['volumes'], ['staging-data:/data'])
        self.assert_original_data()

    def test_missing_copied_stack_entry_rolls_back(self):
        original = self.client.health
        def health(staging=False):
            pages = original(staging)
            if staging:
                pages['en'] = pages['en'].replace(b'Example Stack', b'')
            return pages
        self.client.health = health
        with self.assertRaisesRegex(refresh.Refused, 'Stack render differs'):
            self.apply()
        self.assertEqual(self.state['phase'], 'rolled_back')
        self.assert_original_data()

    def test_account_digest_includes_committed_wal_changes(self):
        database = self.fixture.staging / backup.DB
        before = refresh.accounts(self.fixture.staging)
        with sqlite3.connect(database) as writer:
            writer.execute('PRAGMA journal_mode=WAL')
            writer.execute('PRAGMA wal_autocheckpoint=0')
            writer.execute("UPDATE users SET hash='new-staging-hash'")
            writer.commit()
            changed = refresh.accounts(self.fixture.staging)
            self.assertNotEqual(before, changed)
            writer.execute('PRAGMA wal_checkpoint(TRUNCATE)')
            self.assertEqual(changed, refresh.accounts(self.fixture.staging))

    def test_unknown_native_submission_is_retained_without_repost(self):
        self.fault.at = 'submission:unknown'
        with self.assertRaises(Injected):
            self.apply()
        self.assertEqual(self.state['phase'], 'recovery_required')
        self.assertTrue(self.state['native_pending'])
        self.assertIsNone(self.state['submitted'])
        before = copy.deepcopy(self.client.calls)
        with self.assertRaisesRegex(refresh.Refused, 'Unknown native submission'):
            self.runner.recover(self.state, self.save)
        self.assertEqual(self.client.calls, before)
        self.assertTrue(self.host.running['production'])
        self.assert_original_data()

    def test_recovery_retry_from_durable_journal_after_current_was_stopped(self):
        self.fault.sequence = ['signin', 'notion:rollback']
        with self.assertRaisesRegex(Injected, 'signin'):
            self.apply()
        self.assertEqual(self.state['phase'], 'recovery_required')
        self.assertFalse(self.host.running[self.state['current']['id']])
        # Exact-run recovery consumes the last serialized journal in a new runner.
        self.state = json.loads((self.fixture.output / 'state.json').read_text())
        self.runner = refresh.Refresh(self.client, self.host, sleep=lambda _: None)
        self.runner.notion = SyntheticNotion(self.fault)
        self.runner.recover(self.state, self.save)
        self.assertEqual(self.state['phase'], 'rolled_back')
        self.assertTrue(self.host.running['production'])
        self.assertEqual(self.client.projects[refresh.STAGE]['volumes'], ['staging-data:/data'])
        self.assert_original_data()

    def test_known_ready_native_submission_is_reconciled_before_recovery(self):
        self.fault.at = 'deployment:read'
        with self.assertRaisesRegex(Injected, 'deployment:read'):
            self.apply()
        self.assertEqual(self.state['phase'], 'rolled_back')
        self.assertTrue(self.host.running['production'])
        self.assertEqual(self.client.projects[refresh.STAGE]['volumes'], ['staging-data:/data'])
        self.assertEqual(len([call for call in self.client.calls if call[0] == 'POST']), 2)
        self.assert_original_data()

    def test_plan_only_reads_and_incompatible_revision_refuses_before_stop(self):
        self.assertFalse(any(call[0] != 'GET' for call in self.client.calls))
        for identity in (refresh.PROD, refresh.STAGE):
            self.assertIn(('GET', '/projects/' + identity + '/deployments?perPage=100&page=1', None), self.client.calls)
        self.assertFalse(any(path.startswith('/deployments?') for _, path, _ in self.client.calls))
        self.fault.at = 'compatible'
        with self.assertRaisesRegex(Injected, 'compatible'):
            self.runner.plan()
        self.assertEqual(self.host.running, {'production': True, 'staging': True})
        self.assertNotIn('stop:production', self.fault.events)
        self.assert_original_data()

    def test_production_default_host_requires_exact_local_runtime(self):
        self.client.projects[refresh.PROD]['serverId'] = None
        self.runner.plan()
        self.client.projects[refresh.PROD]['activeDeploymentId'] = 'dep_elsewhere'
        self.client.records['dep_elsewhere'] = {'id': 'dep_elsewhere', 'projectId': refresh.PROD,
                                               'commitSha': COMMIT, 'status': 'ready'}
        with self.assertRaises(KeyError):
            self.runner.plan()

    def test_unexpected_servers_and_staging_default_host_refused(self):
        for identity, server in ((refresh.PROD, 'another-server'), (refresh.STAGE, None),
                                 (refresh.STAGE, 'another-server')):
            original = self.client.projects[identity]['serverId']
            self.client.projects[identity]['serverId'] = server
            with self.assertRaisesRegex(refresh.Refused, 'Project identity'):
                self.runner.project(identity)
            self.client.projects[identity]['serverId'] = original

    def test_compatibility_receipt_binds_images_paths_and_expiry(self):
        receipt_path = self.fixture.root / 'compatibility.json'
        receipt = {name: {key: self.state[name][key] for key in ('commit', 'image')}
                   for name in ('production', 'staging')}
        receipt.update(reviewed_paths=['payload.config.ts'], standards='clean', spec='clean',
                       expires_at=time.time() + 3600)
        self.client.compatible = lambda *args: ['payload.config.ts']
        with patch.object(refresh, 'COMPATIBILITY', receipt_path):
            refresh.save(receipt_path, receipt)
            self.runner.plan()
            for changed in ({'staging': {**receipt['staging'], 'image': 'sha256:wrong'}},
                            {'reviewed_paths': []}, {'expires_at': time.time() - 1}):
                refresh.save(receipt_path, {**receipt, **changed})
                with self.assertRaisesRegex(refresh.Refused, 'Exact-version'):
                    self.runner.plan()
            refresh.save(receipt_path, {**receipt, 'reviewed_paths': ['migrations/new.ts']})
            self.client.compatible = lambda *args: ['migrations/new.ts']
            with self.assertRaisesRegex(refresh.Refused, 'align Staging'):
                self.runner.plan()
        self.assertNotIn('stop:production', self.fault.events)

    def test_actual_schema_difference_refuses_even_without_source_changes(self):
        with sqlite3.connect(self.fixture.staging / backup.DB) as database:
            database.execute('CREATE TABLE incompatible (value TEXT)')
        with self.assertRaisesRegex(refresh.Refused, 'schemas or applied migrations differ'):
            self.runner.plan()
        self.assertNotIn('stop:production', self.fault.events)

    def test_known_nonterminal_submission_blocks_then_terminal_failure_recovers(self):
        self.fault.at = 'submission:unknown'
        with self.assertRaises(Injected):
            self.apply()
        self.state['submitted'] = 'dep_pending'
        self.client.records['dep_pending'] = {'id': 'dep_pending', 'projectId': refresh.STAGE,
                                              'commitSha': COMMIT, 'status': 'building'}
        posts = len([call for call in self.client.calls if call[0] == 'POST'])
        with self.assertRaisesRegex(refresh.Refused, 'known terminal'):
            self.runner.recover(self.state, self.save)
        self.assertEqual(len([call for call in self.client.calls if call[0] == 'POST']), posts)
        self.client.records['dep_pending']['status'] = 'failed'
        self.runner.recover(self.state, self.save)
        self.assertEqual(self.state['phase'], 'rolled_back')
        self.assertEqual(self.client.projects[refresh.STAGE]['volumes'], ['staging-data:/data'])
        self.assertTrue(self.host.running['production'])
        self.assert_original_data()


class ClientAndCredentialsTests(unittest.TestCase):
    def setUp(self):
        self.bundle = {key: 'synthetic-' + key for key in
                       ('openship', 'notion_source', 'notion_target', 'staging_email', 'staging_password')}
        self.client = refresh.Client(self.bundle)

    def test_transport_auth_headers_and_http_error_redaction(self):
        class Opener:
            def open(inner, request, timeout):
                inner.request = request
                raise urllib.error.HTTPError(request.full_url, 403, 'secret-body', {}, io.BytesIO(b'secret-body'))
        opener = Opener()
        self.client.opener = opener
        with self.assertRaisesRegex(refresh.Refused, '^HTTP GET failed with status 403$'):
            self.client.ship('GET', '/projects/' + refresh.STAGE)
        self.assertEqual(opener.request.full_url, 'http://127.0.0.1:4000/api/projects/' + refresh.STAGE)
        self.assertEqual(opener.request.get_header('Authorization'), 'Bearer synthetic-openship')
        self.assertEqual(opener.request.get_header('X-organization-id'), refresh.ORG)
        self.assertEqual(opener.request.get_header('X-openship-scope'), 'fixed')
        self.assertEqual(opener.request.get_header('User-agent'), 'mstefan-staging-refresh/1')

    def test_transport_invalid_oversized_response_and_redirect_refused(self):
        for payload, reason in ((b'not-json synthetic-sensitive', 'unavailable or invalid'),
                                (b'x' * (4 * 1024 * 1024 + 1), 'Response too large')):
            with self.subTest(reason=reason), \
                 patch.object(self.client.opener, 'open', return_value=io.BytesIO(payload)), \
                 self.assertRaisesRegex(refresh.Refused, reason):
                self.client.request('GET', 'https://fixture.invalid', token='synthetic-sensitive')
        with self.assertRaisesRegex(refresh.Refused, 'redirect refused'):
            refresh.NoRedirect().redirect_request(None, None, None, None, None, None)

    def test_write_guard_rejects_production_and_unbounded_operations(self):
        with patch.object(self.client, 'request', return_value={}) as request:
            for method, path, body in [('PATCH', '/projects/' + refresh.PROD, {}),
                                       ('DELETE', '/projects/' + refresh.STAGE, {}),
                                       ('PATCH', '/projects/' + refresh.STAGE, {'autoDeploy': True}),
                                       ('PATCH', '/projects/' + refresh.STAGE, {'volumes': ['data:/data']}),
                                       ('POST', '/deployments', {'projectId': refresh.PROD}),
                                       ('POST', '/deployments', {'projectId': refresh.STAGE, 'environment': 'preview', 'refresh': True, 'extra': True})]:
                with self.subTest(method=method, path=path), self.assertRaises(refresh.Refused):
                    self.client.ship(method, path, body)
            with self.assertRaises(refresh.Refused):
                self.client.notion('source', 'PATCH', '/pages/example', {})
            request.assert_not_called()
            self.client.notion('source', 'POST', '/data_sources/example/query', {})
            self.assertEqual(request.call_args.args[:3], ('POST', 'https://api.notion.com/v1/data_sources/example/query', 'synthetic-notion_source'))

    def test_credential_mode_symlink_owner_and_invalid_bundle_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary).resolve() / 'credentials.json'
            path.write_text(json.dumps(self.bundle))
            path.chmod(0o600)
            self.assertEqual(refresh.credentials(path), self.bundle)
            path.chmod(0o644)
            with self.assertRaises(refresh.Refused):
                refresh.credentials(path)
            path.chmod(0o600)
            alias = path.with_name('alias')
            alias.symlink_to(path)
            with self.assertRaises(ValueError):
                refresh.credentials(alias)
            with patch.object(refresh.os, 'getuid', return_value=os.getuid() + 1), self.assertRaises(refresh.Refused):
                refresh.credentials(path)
            path.write_text(json.dumps({**self.bundle, 'openship': 'unsafe\nvalue'}))
            with self.assertRaises(refresh.Refused):
                refresh.credentials(path)

    def test_cli_plan_has_no_state_or_external_mutation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            lock = root / 'controller.lock'
            lock.touch(mode=0o600)
            state_root = root / 'absent-state'
            output = io.StringIO()
            plan = {'production': {'commit': COMMIT}, 'staging': {'commit': COMMIT},
                    'notion_plan': {'summary': {'count': 2}}}
            with patch.object(sys, 'argv', ['refresh', 'plan', '--credentials-file', str(root / 'opaque')]), \
                 patch.object(refresh.os, 'geteuid', return_value=0), \
                 patch.object(refresh, 'DEPLOY_LOCK', lock), patch.object(refresh, 'STATE_ROOT', state_root), \
                 patch.object(refresh, 'credentials', return_value=self.bundle), \
                 patch.object(refresh.Refresh, 'plan', return_value=plan), \
                 patch.object(refresh.Refresh, 'apply') as apply, patch.object(refresh.Refresh, 'recover') as recover, \
                 patch.object(refresh.signal, 'signal'), patch.object(sys, 'stdout', output):
                self.assertEqual(refresh.main(), 0)
            self.assertEqual(json.loads(output.getvalue())['status'], 'planned')
            self.assertFalse(state_root.exists())
            apply.assert_not_called()
            recover.assert_not_called()
            self.assertNotIn('synthetic-', output.getvalue())


class HostPreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        (self.root / backup.DB).write_bytes(b'synthetic')
        self.project = {'id': refresh.STAGE, 'slug': refresh.SLUGS[refresh.STAGE], 'activeDeploymentId': 'dep_old'}
        self.record = {'id': 'dep_old', 'projectId': refresh.STAGE, 'status': 'ready', 'commitSha': COMMIT}
        self.name = 'openship-' + self.project['slug'] + '-dep_old'
        self.item = {'Id': 'container-old', 'Name': '/' + self.name, 'Image': 'sha256:fixture',
            'State': {'Running': True, 'Paused': False, 'Restarting': False},
            'Mounts': [{'Type': 'volume', 'Name': 'stage-volume', 'Source': str(self.root), 'Destination': '/data', 'RW': True}],
            'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped'}},
            'NetworkSettings': {'Ports': {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '3001'}]}},
            'Config': {'Env': ['SECRET=synthetic-sensitive'], 'User': 'node'}}
        self.host = refresh.Host()

    def tearDown(self):
        self.temp.cleanup()

    def runtime(self):
        def docker(*args):
            if args[0] == 'ps':
                return b'container-old'
            if args[0] == 'exec':
                return str(os.getuid() if args[-1] == '-u' else os.getgid()).encode()
            return json.dumps([self.item]).encode()
        with patch.object(self.host, 'volume', return_value=self.root), \
             patch.object(self.host, 'docker', side_effect=docker):
            return self.host.runtime(self.project, self.record, 'stage-volume')

    def test_valid_private_single_writer_runtime_does_not_emit_env(self):
        result = self.runtime()
        self.assertEqual(result['volume'], 'stage-volume')
        self.assertEqual(result['port'], '3001')
        self.assertNotIn('SECRET', json.dumps(result))
        with patch.object(self.host, 'docker', return_value=json.dumps([self.item]).encode()):
            self.assertNotIn('Config', self.host.inspect(self.name))

    def test_runtime_mount_public_port_shared_volume_and_extra_writer_refused(self):
        original = copy.deepcopy(self.item)
        for change in (lambda: self.item['Mounts'][0].update(Name=refresh.VOLUME),
                       lambda: self.item['Mounts'][0].update(Destination='/other'),
                       lambda: self.item['Mounts'].append(copy.deepcopy(self.item['Mounts'][0])),
                       lambda: self.item['NetworkSettings']['Ports']['3000/tcp'][0].update(HostIp='0.0.0.0')):
            self.item = copy.deepcopy(original)
            change()
            with self.assertRaises(refresh.Refused):
                self.runtime()
        self.item = original
        with patch.object(self.host, 'volume', return_value=self.root), \
             patch.object(self.host, 'inspect', return_value={**self.item, 'User': 'node'}), \
             patch.object(self.host, 'writers', return_value=['container-old', 'unexpected-writer']), self.assertRaises(refresh.Refused):
            self.host.runtime(self.project, self.record, 'stage-volume')

    def test_runtime_user_and_database_owner_mismatch_refused(self):
        self.item['Config']['User'] = 'root'
        with self.assertRaisesRegex(refresh.Refused, 'Runtime user'):
            self.runtime()
        self.item['Config']['User'] = 'node'
        with patch.object(self.host, 'volume', return_value=self.root), \
             patch.object(self.host, 'inspect', return_value={**self.item, 'User': 'node'}), \
             patch.object(self.host, 'writers', return_value=['container-old']), \
             patch.object(self.host, 'docker', return_value=str(os.getuid() + 1).encode()), \
             self.assertRaisesRegex(refresh.Refused, 'ownership'):
            self.host.runtime(self.project, self.record, 'stage-volume')

    def test_overlapping_bind_parent_nested_rw_writers_refused_readonly_ignored(self):
        for source, kind in ((self.root, 'bind'), (self.root.parent, 'bind'), (self.root / 'nested', 'volume')):
            self.item['Mounts'][0].update(Source=str(source), Type=kind)
            with patch.object(self.host, 'docker', return_value=b'container-old'), \
                 patch.object(self.host, 'inspect', return_value=self.item), self.assertRaises(refresh.Refused):
                self.host.writers(self.root)
        self.item['Mounts'][0]['RW'] = False
        with patch.object(self.host, 'docker', return_value=b'container-old'), patch.object(self.host, 'inspect', return_value=self.item):
            self.assertEqual(self.host.writers(self.root), [])

    def test_retained_stopped_runtime_exact_identity_mount_and_no_writers(self):
        runtime = self.runtime()
        self.item['State']['Running'] = False
        with patch.object(self.host, 'inspect', return_value=self.item), patch.object(self.host, 'writers', return_value=[]):
            self.host.stopped(runtime)
            self.item['Image'] = 'sha256:changed'
            with self.assertRaisesRegex(refresh.Refused, 'identity/state'):
                self.host.stopped(runtime)
            self.item['Image'] = runtime['image']
            self.item['Mounts'][0]['Source'] = str(self.root / 'other')
            with self.assertRaisesRegex(refresh.Refused, 'mount changed'):
                self.host.stopped(runtime)
            self.item['Mounts'][0]['Source'] = str(self.root)
        with patch.object(self.host, 'inspect', return_value=self.item), \
             patch.object(self.host, 'writers', return_value=['new-writer']), \
             self.assertRaisesRegex(refresh.Refused, 'competing writer'):
            self.host.stopped(runtime)


if __name__ == '__main__':
    unittest.main()
