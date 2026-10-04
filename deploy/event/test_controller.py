import copy
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import controller as c


def attestation():
    return {'project_id': c.PROJECT, 'repository': c.REPO, 'expires_at': 100,
            'installed_api_revision': 'verified-installed-revision', 'host_mount_namespace': 'mnt:[4026531840]',
            'declared_mounts': c.DECLARED_MOUNTS.copy(), 'docker_volume': c.VOLUME, 'container_prefix': c.CONTAINER_PREFIX,
            **{proof: True for proof in ('native_stop_first_verified', 'retained_image_verified', 'isolated_restore_verified', 'installed_api_verified')}}


def project_fixture():
    return {'data': {'id': c.PROJECT, 'gitOwner': 'Itakello', 'gitRepo': 'mstefan-dev', 'gitProvider': 'github',
                     'gitBranch': 'master', 'autoDeploy': False, 'slug': 'mstefan-payload',
                     'routeStrategy': 'loopback-port', 'volumes': ['data:/data']}}


def writer_fixture(deployment_id='dep_new'):
    return {'ok': True, 'volume': c.VOLUME, 'count': 1, 'users': [{'id': '1' * 64, 'name': c.CONTAINER_PREFIX + deployment_id,
            'status': 'running', 'destination': '/data', 'rw': True, 'mount_type': 'volume'}]}

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

    def volume_writer(self, deployment_id, attestation):
        pass

    def smoke(self, deployment_id, sha, attestation):
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

    def test_invalid_live_writer_prevents_submission(self):
        for result in ({'ok': False}, writer_fixture('dep_other'), dict(writer_fixture(), count=2)):
            with self.subTest(result=result):
                self.state = {'phase': 'idle', 'failed_shas': []}
                self.client = Fake()
                self.client.probe = lambda: result
                self.client.volume_writer = lambda deployment_id, proof: c.Client.volume_writer(self.client, deployment_id, proof)
                with self.assertRaises(c.Blocked):
                    c.run(self.client, self.state, self.path, NEW, 5, attestation(), clock=lambda: 10)
                self.assertEqual(self.client.posts, 0)

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
        self.assertEqual(self.state['failure_phase'], 'submit_unknown')
        self.assertIn(NEW, self.state['failed_shas'])
        self.client.error = None
        with self.assertRaises(c.Refused):
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

    def test_start_refusals_preserve_existing_state_bytes_and_failed_shas(self):
        for phase, incoming_sha, incoming_run in (
            ('submit_unknown', NEW, 5),
            ('paused', OLD, 6),
            ('observing', OLD, 6),
            ('prepared', OLD, 6),
            ('smoke', OLD, 6),
        ):
            with self.subTest(phase=phase):
                self.state = {'phase': phase, 'sha': NEW, 'run_id': 5, 'deadline': 100,
                              'deployment_id': 'dep_new', 'failed_shas': [NEW] if phase == 'paused' else [],
                              'reason': 'existing evidence', 'baseline': {'id': ID, 'sha': OLD}}
                c.save(self.path, self.state)
                original_bytes = self.path.read_bytes()
                original_state = copy.deepcopy(self.state)
                with self.assertRaises(c.Refused):
                    c.run(self.client, self.state, self.path, incoming_sha, incoming_run, {}, clock=lambda: 10)
                self.assertEqual(self.path.read_bytes(), original_bytes)
                self.assertEqual(self.state, original_state)
                self.assertEqual(self.client.posts, 0)

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

    def test_release_capture_precedes_smoke_and_survives_failed_smoke(self):
        ledger = Path(self.temp.name) / 'delivery' / 'releases.json'
        c.release_observations.init(ledger)
        self.client.gh = lambda path: {'status': 'ahead', 'base_commit': {'sha': OLD}, 'total_commits': 1,
                                       'commits': [{'sha': NEW, 'commit': {'committer': {'date': '2020-01-01T00:00:00Z'}}}]}
        self.client.health_error = True
        with patch.dict(os.environ, {'MSTEFAN_RELEASE_OBSERVATIONS': str(ledger)}):
            with self.assertRaises(c.Blocked):
                self.run_flow()
        data = json.loads(ledger.read_text())
        self.assertEqual(data['captureState'], 'ready')
        self.assertEqual([(row['id'], row['classification'], row['commitCoverageComplete']) for row in data['deployments']],
                         [('dep_new', 'unknown', True)])
        self.assertEqual(self.client.posts, 1)
        self.assertEqual(self.state['failure_phase'], 'smoke')

    def test_release_admission_blocks_post(self):
        ledger = Path(self.temp.name) / 'delivery' / 'releases.json'
        c.release_observations.init(ledger)
        c.release_observations.activate(ledger)
        c.release_observations.pause(ledger)
        with patch.dict(os.environ, {'MSTEFAN_RELEASE_OBSERVATIONS': str(ledger)}):
            with self.assertRaises(c.Blocked):
                self.run_flow()
        self.assertEqual(self.client.posts, 0)
        self.assertEqual(self.state['failure_phase'], 'idle')

    def test_release_byte_capacity_blocks_production_post(self):
        ledger = Path(self.temp.name) / 'delivery' / 'releases.json'
        c.release_observations.init(ledger)
        c.release_observations.activate(ledger)
        before = ledger.read_bytes()
        with patch.dict(os.environ, {'MSTEFAN_RELEASE_OBSERVATIONS': str(ledger)}), \
             patch.object(c.release_observations, 'MAX_BYTES', len(before) + c.release_observations.MAX_RECORD_RESERVE - 1):
            with self.assertRaises(c.Blocked):
                self.run_flow()
        self.assertEqual(self.client.posts, 0)
        self.assertEqual(ledger.read_bytes(), before)
        self.assertEqual(c.release_observations.capture_state(ledger), 'ready')

    def test_full_release_ledger_blocks_production_post(self):
        ledger = Path(self.temp.name) / 'delivery' / 'releases.json'
        c.release_observations.init(ledger)
        c.release_observations.activate(ledger)
        data = json.loads(ledger.read_text())
        data['deployments'] = [
            {'id': f'dep_{index}', 'sha': OLD, 'baselineSha': OLD,
             'deployedAt': data['coverageStartedAt'], 'classification': 'unknown',
             'commits': [], 'commitCoverageComplete': False,
             'incidentStartedAt': None, 'recoveredAt': None}
            for index in range(c.release_observations.MAX_DEPLOYMENTS)
        ]
        ledger.write_text(json.dumps(data))
        before = ledger.read_bytes()
        with patch.dict(os.environ, {'MSTEFAN_RELEASE_OBSERVATIONS': str(ledger)}):
            with self.assertRaises(c.Blocked):
                self.run_flow()
        self.assertEqual(self.client.posts, 0)
        self.assertEqual(ledger.read_bytes(), before)
        self.assertEqual(c.release_observations.capture_state(ledger), 'ready')

    def test_existing_active_sha_does_not_backfill_release(self):
        ledger = Path(self.temp.name) / 'delivery' / 'releases.json'
        c.release_observations.init(ledger)
        self.client.active = {'id': ID, 'sha': NEW}
        with patch.dict(os.environ, {'MSTEFAN_RELEASE_OBSERVATIONS': str(ledger)}):
            self.run_flow()
        self.assertEqual(json.loads(ledger.read_text())['deployments'], [])
        self.assertEqual(self.client.posts, 0)

    def test_capture_failure_blocks_smoke_and_preserves_pending(self):
        ledger = Path(self.temp.name) / 'delivery' / 'releases.json'
        c.release_observations.init(ledger)
        c.release_observations.activate(ledger)
        c.release_observations.mark_pending(ledger)
        self.state.update(phase='smoke', sha=NEW, run_id=5, deadline=100,
                          deployment_id='dep_new', baseline={'id': ID, 'sha': OLD},
                          release_observation_ledger=str(ledger),
                          release_observation_pending={'id': 'dep_new', 'sha': NEW, 'baselineSha': OLD,
                                                         'deployedAt': c.release_observations.now_utc()})
        self.client.active = {'id': 'dep_new', 'sha': NEW}
        with patch.dict(os.environ, {'MSTEFAN_RELEASE_OBSERVATIONS': str(ledger)}), \
             patch.object(c.release_observations, 'record', side_effect=c.release_observations.ObservationError('private')):
            with self.assertRaises(c.Blocked):
                self.run_flow()
        self.assertEqual(self.state['phase'], 'paused')
        self.assertEqual(json.loads(ledger.read_text())['captureState'], 'pending')
        self.assertIn('release_observation_pending', c.load(self.path))

    def test_capture_replays_same_confirmed_release_after_save_failure(self):
        ledger = Path(self.temp.name) / 'delivery' / 'releases.json'
        c.release_observations.init(ledger)
        c.release_observations.activate(ledger)
        c.release_observations.mark_pending(ledger)
        pending = {'id': 'dep_new', 'sha': NEW, 'baselineSha': OLD,
                   'deployedAt': c.release_observations.now_utc()}
        self.state.update(phase='smoke', sha=NEW, run_id=5, deadline=100,
                          deployment_id='dep_new', baseline={'id': ID, 'sha': OLD},
                          release_observation_ledger=str(ledger),
                          release_observation_pending=pending)
        self.client.active = {'id': 'dep_new', 'sha': NEW}
        c.save(self.path, self.state)
        with patch.dict(os.environ, {'MSTEFAN_RELEASE_OBSERVATIONS': str(ledger)}):
            original = c.save
            calls = 0
            def crash(path, state):
                nonlocal calls
                calls += 1
                if calls == 1:
                    raise SystemExit('after ledger commit')
                original(path, state)
            with patch.object(c, 'save', crash), self.assertRaises(SystemExit):
                c.tick(self.client, self.state, self.path, NEW, 5, {}, 10)
            persisted = c.load(self.path)
            c.tick(self.client, persisted, self.path, NEW, 5, {}, 10)
        rows = json.loads(ledger.read_text())['deployments']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['deployedAt'], pending['deployedAt'])
        self.assertEqual(self.client.posts, 0)

    def test_disabling_bound_ledger_pauses_feed_before_next_release(self):
        ledger = Path(self.temp.name) / 'delivery' / 'releases.json'
        c.release_observations.init(ledger)
        with patch.dict(os.environ, {'MSTEFAN_RELEASE_OBSERVATIONS': str(ledger)}):
            c.register_release_ledger(self.state, self.path)
        self.assertEqual(c.load(self.path)['release_observation_ledger'], str(ledger))
        with patch.dict(os.environ, {'MSTEFAN_RELEASE_OBSERVATIONS': ''}):
            with self.assertRaises(c.Blocked):
                self.run_flow()
        self.assertEqual(self.client.posts, 0)
        self.assertEqual(self.state['phase'], 'paused')
        self.assertEqual(c.release_observations.capture_state(ledger), 'paused')

    def test_changing_bound_ledger_refuses_new_path_and_pauses_old(self):
        ledger = Path(self.temp.name) / 'delivery' / 'releases.json'
        other = Path(self.temp.name) / 'other' / 'releases.json'
        c.release_observations.init(ledger)
        c.release_observations.init(other)
        with patch.dict(os.environ, {'MSTEFAN_RELEASE_OBSERVATIONS': str(ledger)}):
            c.register_release_ledger(self.state, self.path)
        with patch.dict(os.environ, {'MSTEFAN_RELEASE_OBSERVATIONS': str(other)}):
            with self.assertRaises(c.Blocked):
                self.run_flow()
        self.assertEqual(c.release_observations.capture_state(ledger), 'paused')
        self.assertEqual(c.release_observations.capture_state(other), 'inactive')
        self.assertEqual(self.client.posts, 0)

    def test_binding_is_durable_before_activating_new_coverage(self):
        ledger = Path(self.temp.name) / 'delivery' / 'releases.json'
        c.release_observations.init(ledger)
        with patch.dict(os.environ, {'MSTEFAN_RELEASE_OBSERVATIONS': str(ledger)}):
            with patch.object(c.release_observations, 'activate', side_effect=SystemExit('crash')):
                with self.assertRaises(SystemExit):
                    c.register_release_ledger(self.state, self.path)
            self.assertEqual(c.load(self.path)['release_observation_ledger'], str(ledger))
            self.assertEqual(c.release_observations.capture_state(ledger), 'inactive')
            persisted = c.load(self.path)
            c.register_release_ledger(persisted, self.path)
        self.assertEqual(c.release_observations.capture_state(ledger), 'ready')
        self.assertEqual(self.client.posts, 0)

    def test_binding_existing_ready_ledger_preserves_coverage_start(self):
        ledger = Path(self.temp.name) / 'delivery' / 'releases.json'
        c.release_observations.init(ledger)
        c.release_observations.activate(ledger)
        before = json.loads(ledger.read_text())['coverageStartedAt']
        with patch.dict(os.environ, {'MSTEFAN_RELEASE_OBSERVATIONS': str(ledger)}):
            c.register_release_ledger(self.state, self.path)
        self.assertEqual(json.loads(ledger.read_text())['coverageStartedAt'], before)


class Contracts(unittest.TestCase):
    def setUp(self):
        self.client = c.Client({'GITHUB_TOKEN': 'fake', 'OPENSHIP_TOKEN': 'fake'})
        self.client.ship = lambda *args: project_fixture()
        self.client.probe = writer_fixture
        self.run = {'id': 5, 'head_sha': NEW, 'head_branch': 'master', 'event': 'push', 'status': 'completed', 'conclusion': 'success', 'path': '.github/workflows/ci.yml', 'repository': {'full_name': c.REPO}, 'head_repository': {'full_name': c.REPO}}
        self.jobs = [{'name': name, 'run_id': 5, 'head_sha': NEW, 'status': 'completed', 'conclusion': 'success' if name in {'verify', 'project-technologies'} else 'skipped'} for name in ('verify', 'project-technologies', 'policy-gate', 'docs-workflow-integrity')]

    def gh(self, path):
        if path.startswith('/git/ref/'):
            return {'object': {'sha': NEW}}
        if '/jobs?' in path:
            return {'total_count': len(self.jobs), 'jobs': self.jobs}
        return self.run

    def test_public_github_metadata_does_not_require_a_token(self):
        client = c.Client({'OPENSHIP_TOKEN': 'fake'})
        with patch.object(client, 'request', return_value={}) as request:
            client.gh('/git/ref/heads/master')
        self.assertEqual(request.call_args.args, ('GET', 'https://api.github.com/repos/' + c.REPO + '/git/ref/heads/master', ''))

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

    def test_actual_installed_project_contract_and_changed_mounts(self):
        project = project_fixture()
        self.client.ship = lambda *args: project
        proof = attestation()
        self.client.activation(proof, 10)
        changes = {'id': 'other', 'gitOwner': 'other', 'gitRepo': 'other', 'gitProvider': 'other',
                   'gitBranch': 'other', 'autoDeploy': True, 'slug': 'other', 'routeStrategy': 'container-ip'}
        for key, wrong in changes.items():
            with self.subTest(key=key):
                original = project['data'][key]
                project['data'][key] = wrong
                with self.assertRaises(c.Blocked):
                    self.client.activation(proof, 10)
                project['data'][key] = original
        for mounts in (None, [], ['other:/data'], ['data:/other'], ['data:/data', 'extra:/extra'], [{'target': '/data'}]):
            with self.subTest(mounts=mounts):
                project['data']['volumes'] = mounts
                with self.assertRaises(c.Blocked):
                    self.client.activation(proof, 10)
        project['data']['volumes'] = ['data:/data']
        with self.assertRaises(c.Blocked):
            self.client.activation(proof, 100)
        proof['docker_volume'] = 'other'
        with self.assertRaises(c.Blocked):
            self.client.activation(proof, 10)

    def test_volume_probe_rejects_extra_read_only_wrong_deployment_and_error(self):
        self.client.volume_writer('dep_new', attestation())
        variants = [{'ok': False}, dict(writer_fixture(), count=0, users=[]), dict(writer_fixture(), count=2, users=writer_fixture()['users'] * 2), writer_fixture('dep_other')]
        for key, wrong in (('rw', False), ('status', 'paused'), ('status', 'restarting'), ('destination', '/other'), ('mount_type', 'bind'), ('id', 'bad')):
            variant = writer_fixture()
            variant['users'][0][key] = wrong
            variants.append(variant)
        for result in variants:
            with self.subTest(result=result):
                self.client.probe = lambda: result
                with self.assertRaises(c.Blocked):
                    self.client.volume_writer('dep_new', attestation())

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
        self.client.smoke('dep_new', NEW, attestation())
        self.assertEqual(len([url for url in urls if url.removeprefix('https://www.mstefan.dev') in c.PUBLIC]), 6)
        self.assertTrue(all(url.startswith('https://www.mstefan.dev/') for url in urls))
        self.client.request = lambda *args, **kwargs: 200
        with self.assertRaises(c.Blocked):
            self.client.smoke('dep_new', NEW, attestation())
        with self.assertRaises(c.Blocked):
            c.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.example')

    def test_submit_exact_payload_without_environment_mutation(self):
        calls = []
        self.client.ship = lambda *args: calls.append(args) or {'deployment_id': 'dep_new'}
        self.assertEqual(self.client.submit(NEW), 'dep_new')
        self.assertEqual(calls, [('POST', '/api/deployments', {'projectId': c.PROJECT, 'branch': 'master', 'commitSha': NEW, 'environment': 'production'})])

    def test_deployment_id_matches_bounded_ledger_contract(self):
        accepted = 'dep_' + 'x' * 121
        self.client.ship = lambda *args: {'deployment_id': accepted}
        self.assertEqual(self.client.submit(NEW), accepted)
        oversized = 'dep_' + 'x' * (c.release_observations.MAX_ID_BYTES - 3)
        self.client.ship = lambda *args: {'deployment_id': oversized}
        with self.assertRaises(c.Blocked):
            self.client.submit(NEW)
        self.client.ship = lambda *args: {'activeDeploymentId': oversized}
        with self.assertRaises(c.Blocked):
            self.client.baseline()


if __name__ == '__main__':
    unittest.main()
