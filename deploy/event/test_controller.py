import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import controller as c

OLD, NEW = 'a' * 40, 'b' * 40
ID = 'dep_old'


class Fake:
    def __init__(self):
        self.posts = 0
        self.active = {'id': ID, 'sha': OLD}
        self.complete = True
        self.error = None
        self.health_error = False
        self.current_sha = NEW

    def current_master(self, sha):
        if sha != self.current_sha:
            raise c.Superseded()

    def gate(self, sha, run):
        self.current_master(sha)
        if self.error == 'gate':
            raise c.Blocked('CI failed')

    def activation(self, attestation, now):
        if self.error == 'activation':
            raise c.Blocked('configuration changed')

    def baseline(self):
        return self.active.copy()

    def compatible(self, baseline, sha):
        if self.error == 'schema':
            raise c.Blocked('schema changed')

    def submit(self, sha):
        self.posts += 1
        if self.error == 'post':
            raise c.Blocked('unknown POST result')
        self.active = {'id': 'dep_new', 'sha': sha}
        return 'dep_new'

    def observe(self, deployment_id, sha):
        if self.error == 'observe':
            raise c.Blocked('build failed')
        return self.complete

    def smoke(self, deployment_id, sha):
        if self.health_error or self.active != {'id': deployment_id, 'sha': sha}:
            raise c.Blocked('health or identity failed')


class FlowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'state.json'
        self.state = c.load(self.path)
        self.client = Fake()

    def run_flow(self):
        c.run(self.client, self.state, self.path, NEW, 5, {}, clock=lambda: 10, sleep=lambda _: None)

    def test_success_and_replay_submit_once(self):
        self.run_flow()
        self.run_flow()
        self.assertEqual(self.client.posts, 1)
        self.assertEqual(c.load(self.path)['last_success'], NEW)

    def test_superseded_events_idle_and_prepared_do_not_pause_latest(self):
        for phase in ('idle', 'prepared'):
            with self.subTest(phase=phase):
                self.client = Fake()
                self.state = {'phase': phase, 'failed_shas': [], 'sha': OLD, 'run_id': 4, 'baseline': {'id': ID, 'sha': OLD}, 'deadline': 100}
                c.run(self.client, self.state, self.path, OLD, 4, {}, clock=lambda: 10)
                self.assertEqual(self.state['phase'], 'idle')
                self.assertEqual(self.state['failed_shas'], [])
                self.run_flow()
                self.assertEqual(self.client.posts, 1)
                self.assertEqual(self.state['last_success'], NEW)

    def test_master_advances_during_final_preflight_skips_without_submission(self):
        for step in ('activation', 'baseline'):
            with self.subTest(step=step):
                self.client = Fake()
                self.state = {'phase': 'idle', 'failed_shas': []}
                original = getattr(self.client, step)
                calls = 0
                def advance(*args):
                    nonlocal calls
                    calls += 1
                    result = original(*args)
                    if calls == 2:
                        self.client.current_sha = OLD
                    return result
                setattr(self.client, step, advance)
                result = c.run(self.client, self.state, self.path, NEW, 5, {}, clock=lambda: 10)
                self.assertEqual(result, 'superseded')
                self.assertEqual(self.client.posts, 0)
                self.assertEqual(self.state['phase'], 'idle')
                self.assertEqual(self.state['failed_shas'], [])
                self.assertEqual(c.load(self.path)['phase'], 'idle')

    def test_build_input_change_blocks_before_submission(self):
        for protected_path in ('.dockerignore', 'tsconfig.json', 'next.config.mjs'):
            with self.subTest(path=protected_path):
                self.client = Fake()
                self.state = {'phase': 'idle', 'failed_shas': []}
                old = {'truncated': False, 'tree': [{'path': protected_path, 'type': 'blob', 'mode': '100644', 'sha': OLD}]}
                new = {'truncated': False, 'tree': [{'path': protected_path, 'type': 'blob', 'mode': '100644', 'sha': NEW}]}
                self.client.gh = lambda path: old if OLD in path else new
                self.client.compatible = lambda baseline, sha: c.Client.compatible(self.client, baseline, sha)
                with self.assertRaises(c.Blocked):
                    self.run_flow()
                self.assertEqual(self.client.posts, 0)
                self.assertEqual(self.state['phase'], 'paused')
                self.assertIn('schema, dependency or startup', self.state['reason'])

    def test_current_active_same_sha_checks_health_without_post(self):
        self.client.active = {'id': ID, 'sha': NEW}
        self.run_flow()
        self.assertEqual(self.client.posts, 0)
        self.assertEqual(self.state['last_deployment'], ID)

    def test_preflight_failure_and_failed_sha_pause(self):
        for failure in ('gate', 'schema', 'activation'):
            with self.subTest(failure=failure):
                self.state = {'phase': 'idle', 'failed_shas': []}
                self.client.error = failure
                with self.assertRaises(c.Blocked):
                    self.run_flow()
                self.assertEqual(self.state['phase'], 'paused')
                self.assertIn(NEW, self.state['failed_shas'])
                self.assertEqual(self.client.posts, 0)

    def test_post_failure_unknown_result_never_replayed(self):
        self.client.error = 'post'
        with self.assertRaises(c.Blocked):
            self.run_flow()
        self.client.error = None
        with self.assertRaises(c.Blocked):
            self.run_flow()
        self.assertEqual(self.client.posts, 1)

    def test_crash_after_post_before_id_save_durable_marker(self):
        c.tick(self.client, self.state, self.path, NEW, 5, {}, 10)
        real_save = c.save
        def crash(path, state):
            if state['phase'] == 'observing':
                raise SystemExit('simulated crash')
            real_save(path, state)
        with patch.object(c, 'save', crash), self.assertRaises(SystemExit):
            c.tick(self.client, self.state, self.path, NEW, 5, {}, 10)
        self.state = c.load(self.path)
        self.assertEqual(self.state['phase'], 'submit_unknown')
        with self.assertRaises(c.Blocked):
            self.run_flow()
        self.assertEqual(self.client.posts, 1)

    def test_active_baseline_change_prevents_post(self):
        c.tick(self.client, self.state, self.path, NEW, 5, {}, 10)
        self.client.active['id'] = 'dep_external'
        with self.assertRaises(c.Blocked):
            self.run_flow()
        self.assertEqual(self.client.posts, 0)

    def test_timeout_and_failure_pause_without_recovery_post(self):
        for reason in ('timeout', 'observe', 'smoke'):
            with self.subTest(reason=reason):
                self.state = {'phase': 'observing', 'sha': NEW, 'run_id': 5, 'deadline': 9 if reason == 'timeout' else 100, 'deployment_id': 'dep_new', 'failed_shas': []}
                self.client.error = 'observe' if reason == 'observe' else None
                self.client.health_error = reason == 'smoke'
                with self.assertRaises(c.Blocked):
                    self.run_flow()
                self.assertEqual(self.state['phase'], 'paused')
                self.assertEqual(self.client.posts, 0)


class Contracts(unittest.TestCase):
    def setUp(self):
        self.client = c.Client({'GITHUB_TOKEN': 'fake', 'OPENSHIP_TOKEN': 'fake'})
        self.run = {'id': 5, 'head_sha': NEW, 'head_branch': 'master', 'event': 'push', 'status': 'completed', 'conclusion': 'success', 'path': '.github/workflows/ci.yml', 'repository': {'full_name': c.REPO}, 'head_repository': {'full_name': c.REPO}}
        self.jobs = [{'name': name, 'run_id': 5, 'head_sha': NEW, 'status': 'completed', 'conclusion': 'success' if name in {'verify', 'project-technologies'} else 'skipped'} for name in ('verify', 'project-technologies', 'policy-gate', 'docs-workflow-integrity')]

    def gh(self, path):
        if path.startswith('/git/ref/'):
            return {'object': {'sha': NEW}}
        if '/jobs?' in path:
            return {'total_count': len(self.jobs), 'jobs': self.jobs}
        return self.run

    def test_exact_ci_gate_and_identity_failures(self):
        self.client.gh = self.gh
        self.client.gate(NEW, 5)
        for key, wrong in (('head_sha', OLD), ('event', 'pull_request'), ('path', '.github/workflows/other.yml'), ('conclusion', 'failure'), ('id', 6)):
            with self.subTest(key=key):
                original = self.run[key]
                self.run[key] = wrong
                with self.assertRaises(c.Blocked):
                    self.client.gate(NEW, 5)
                self.run[key] = original
        self.jobs[0]['head_sha'] = OLD
        with self.assertRaises(c.Blocked):
            self.client.gate(NEW, 5)

    def test_recursive_tree_addition_deletion_change_and_truncation(self):
        entry = {'path': 'migrations/new/schema.ts', 'type': 'blob', 'mode': '100644', 'sha': OLD}
        old = {'truncated': False, 'tree': [entry]}
        new = copy.deepcopy(old)
        self.client.gh = lambda path: old if OLD in path else new
        self.client.compatible({'sha': OLD}, NEW)
        for changed in ({'truncated': False, 'tree': []}, {'truncated': False, 'tree': [dict(entry, sha=NEW)]}, {'truncated': True, 'tree': [entry]}):
            new = changed
            with self.assertRaises(c.Blocked):
                self.client.compatible({'sha': OLD}, NEW)
        for path in ('Dockerfile', 'payload.config.ts', 'payload/collections/User.ts', 'pnpm-lock.yaml', 'lib/i18n/copy.ts', 'scripts/startup.sh'):
            self.assertTrue(c.protected(path), path)
        self.assertFalse(c.protected('app/[locale]/projects/page.tsx'))
        self.assertFalse(c.protected('deploy/payload-production/README.md'))
        self.assertFalse(c.protected('app/globals.css'))

    def test_activation_exact_project_fields_and_expiry(self):
        project = {'routing': 'loopback-port', 'volume': {'source': 'existing-volume', 'target': '/data'}, 'writers': 1}
        self.client.ship = lambda *args: project
        attestation = {'project_id': c.PROJECT, 'repository': c.REPO, 'expires_at': 100, 'installed_api_revision': 'verified-installed-revision',
                       **{proof: True for proof in ('native_stop_first_verified', 'retained_image_verified', 'isolated_restore_verified', 'installed_api_verified')},
                       'live_project_checks': {name: {'path': path, 'value': value} for name, path, value in [('routing', ['routing'], 'loopback-port'), ('volume_target', ['volume', 'target'], '/data'), ('volume_source', ['volume', 'source'], 'existing-volume'), ('writers', ['writers'], 1)]}}
        self.client.activation(attestation, 10)
        project['volume'] = [project['volume']]
        attestation['live_project_checks']['volume_target']['path'] = ['volume', 0, 'target']
        attestation['live_project_checks']['volume_source']['path'] = ['volume', 0, 'source']
        self.client.activation(attestation, 10)
        attestation['live_project_checks']['volume_target']['path'] = ['volume', False, 'target']
        with self.assertRaises(c.Blocked):
            self.client.activation(attestation, 10)
        attestation['live_project_checks']['volume_target']['path'] = ['volume', 0, 'target']
        project['routing'] = 'container-ip'
        with self.assertRaises(c.Blocked):
            self.client.activation(attestation, 10)
        project['routing'] = 'loopback-port'
        with self.assertRaises(c.Blocked):
            self.client.activation(attestation, 100)

    def test_deployment_record_mismatch_and_build_failure(self):
        self.client.ship = lambda method, path: {'projectId': 'other', 'commitSha': NEW, 'status': 'ready'}
        with self.assertRaises(c.Blocked):
            self.client.observe('dep_new', NEW)
        self.client.ship = lambda method, path: ({'status': 'failed', 'deploymentStatus': 'failed'} if path.endswith('/build') else {'projectId': c.PROJECT, 'commitSha': NEW, 'status': 'failed'})
        with self.assertRaises(c.Blocked):
            self.client.observe('dep_new', NEW)

    def test_smoke_exact_www_routes_and_privacy(self):
        self.client.baseline = lambda: {'id': 'dep_new', 'sha': NEW}
        urls = []
        def request(method, url, **kwargs):
            urls.append(url)
            return 200 if url.removeprefix('https://www.mstefan.dev') in c.PUBLIC else 404
        self.client.request = request
        self.client.smoke('dep_new', NEW)
        self.assertEqual(len([url for url in urls if url.removeprefix('https://www.mstefan.dev') in c.PUBLIC]), 6)
        self.assertTrue(all(url.startswith('https://www.mstefan.dev/') for url in urls))
        self.client.request = lambda *args, **kwargs: 200
        with self.assertRaises(c.Blocked):
            self.client.smoke('dep_new', NEW)
        with self.assertRaises(c.Blocked):
            c.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.example')

    def test_submit_exact_payload_without_environment_mutation(self):
        calls = []
        self.client.ship = lambda *args: calls.append(args) or {'deployment_id': 'dep_new'}
        self.assertEqual(self.client.submit(NEW), 'dep_new')
        self.assertEqual(calls, [('POST', '/api/deployments', {'projectId': c.PROJECT, 'branch': 'master', 'commitSha': NEW, 'environment': 'production'})])


if __name__ == '__main__':
    unittest.main()
