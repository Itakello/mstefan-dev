import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runPreview, validatePR, validateProject, payloadSecret, clients } from './controller.mjs';

const sha = 'a'.repeat(40);
const org = 'org_bf9659df-3efc-4659-8893-13baf6533b28';
const production = 'proj_w1kqcgR7eY2EZhht';
const template = {
  id: 'proj_template', organizationId: org, groupId: 'group_preview', slug: 'mstefan-pr-previews',
  gitProvider: 'github', gitOwner: 'Itakello', gitRepo: 'mstefan-dev', gitBranch: 'master',
  framework: 'docker', packageManager: 'pnpm', hasBuild: true, hasServer: true, rootDirectory: '.', port: 3000, routeStrategy: 'loopback-port', runtimeMode: 'docker',
  sourceKind: 'git', buildKind: 'dockerfile', workloadType: 'web', autoDeploy: false, volumes: ['data:/data'],
  startCommand: null, releaseCommands: null, activeDeploymentId: null, environmentType: 'production', environmentSlug: 'production',
  readiness: { path: '/en/about', port: 3000, timeoutSeconds: 120, stabilizationSeconds: 30 },
};
const child = { ...template, id: 'proj_preview', slug: 'mstefan-pr-previews-pr-42', environmentSlug: 'pr-42',
  environmentType: 'preview', gitBranch: 'feature/example', enabled: true, disabledAt: null };
const pull = { number: 42, state: 'open', base: { repo: { full_name: 'Itakello/mstefan-dev' } },
  head: { sha, ref: child.gitBranch, repo: { full_name: 'Itakello/mstefan-dev' } } };

function fixture(options = {}) {
  const calls = [];
  const pr = structuredClone(pull);
  let project = options.existing ? structuredClone(child) : null;
  let domain = null;
  let custom = options.custom ?? null;
  let active = '7';
  let vars = options.vars ?? [];
  let clock = 0;
  let cancels = 0;
  const record = { id: 'dep_preview', organizationId: org, projectId: child.id, commitSha: sha, environment: 'preview', status: 'ready',
    meta: { organizationId: org, runtimeMode: 'docker', build: 'dockerfile', source: 'git', workload: 'web', port: 3000, volumes: ['data:/data'] } };
  if (options.existing) project.activeDeploymentId = record.id;
  return {
    calls, pr, record, get project() { return project; }, get active() { return active; },
    args: {
      number: 42, templateId: template.id, seed: 'test-seed-for-previews-'.repeat(3),
      now: () => clock, sleep: async ms => { clock += ms; },
      async gh(method, path, body) {
        calls.push({ provider: 'gh', method, path, body });
        if (path.includes('/pulls/')) return structuredClone(pr);
        if (method === 'POST' && path.endsWith('/deployments')) return { id: 123 };
        if (method === 'GET' && path.includes('/deployments?')) return [
          { id: 123, environment: 'pr-42', payload: { owner: 'mstefan-pr-previews', pr: 42 } },
          { id: 999, environment: 'production', payload: { owner: 'someone-else' } },
        ];
        if (path.includes('/statuses')) return { state: body.state };
        throw new Error('Unexpected mock GitHub call');
      },
      async ship(name, args) {
        calls.push({ provider: 'ship', name, args });
        assert.notEqual(args.id, production);
        assert.notEqual(args.body?.projectId, production);
        if (name === 'get_projects_by_id') return { data: args.id === template.id ? structuredClone(template) : structuredClone(project) };
        if (name === 'get_projects_by_id_environments') return { data: project ? [{ id: project.id, slug: 'pr-42' }] : [] };
        if (name === 'post_projects_by_id_environments') {
          project = structuredClone(child);
          project.routeStrategy = 'auto';
          project.readiness = null;
          return { success: true, data: { id: project.id, slug: project.environmentSlug } };
        }
        if (name === 'get_projects_by_id_env') return { data: args.query.environment === 'production' ? [] : structuredClone(vars) };
        if (name === 'patch_projects_by_id_env') { vars = args.body.upserts.map(v => ({ ...v, value: v.isSecret ? '********' : v.value })); return { data: vars }; }
        if (name === 'get_deployments_by_id') return { data: structuredClone(record) };
        if (name === 'get_deployments_by_id_build') {
          const pending = (options.cancelTransportError && !options.cancelCompleted) || cancels < (options.pendingCancels ?? 0);
          return { deployment_id: record.id, project_id: child.id, deploymentStatus: record.status,
            completionPending: pending, cancellationPending: record.status === 'cancelled' && pending };
        }
        if (name === 'get_deployments') return { rows: [structuredClone(record)], total: 1 };
        if (name === 'post_deployments_by_id_cancel') {
          record.status = 'cancelled';
          cancels++;
          if (options.cancelTransportError) throw new Error('Simulated transport error');
          return cancels <= (options.pendingCancels ?? 0)
            ? { success: false, pending: true, status: 'cancelling' }
            : { success: true, pending: false, status: 'cancelled' };
        }
        if (name === 'get_deployments_by_id_info') return { data: { status: project.enabled ? 'running' : 'exited' } };
        if (name === 'post_deployments') { if (record.status === 'ready') project.activeDeploymentId = record.id; return { data: { project_id: project.id, deployment_id: record.id } }; }
        if (name === 'patch_projects_by_id') { Object.assign(project, args.body); return { data: project }; }
        if (name === 'post_projects_by_id_enable') { project.enabled = true; project.disabledAt = null; return { data: project }; }
        if (name === 'post_projects_by_id_disable') { project.enabled = false; project.disabledAt = '2026-10-09T00:00:00Z'; return { data: project }; }
        if (name === 'get_domains') return { data: domain ? [domain] : [] };
        if (name === 'post_domains') { domain = { ...args.body, id: 'dom_origin' }; return { data: domain }; }
        if (name === 'post_domains_by_id_verify') {
          Object.assign(domain, { verified: true, sslStatus: options.tls === false ? 'external' : 'active', sslExpiresAt: '2099-01-01T00:00:00Z' });
          return { verified: true };
        }
        if (name === 'get_domains_by_id') return { data: structuredClone(domain) };
        if (name === 'post_domains_by_id_verify_ssl') return { data: { domain: domain.hostname, sslStatus: domain.sslStatus,
          expiresAt: domain.sslExpiresAt, verified: options.sslVerified !== false } };
        throw new Error('Unexpected mock OpenShip call');
      },
      async cf(method, path, body) {
        calls.push({ provider: 'cf', method, path, body });
        if (path.includes('/settings')) {
          if (method === 'PATCH') active = body.bindings[0].text;
          return { bindings: [{ name: 'ACTIVE_PRS', type: 'plain_text', text: active }] };
        }
        if (path.includes('/dns_records')) return [];
        if (method === 'GET') return custom ? [custom] : [];
        if (method === 'PUT') { custom = { ...body, id: 'custom_preview' }; return custom; }
        if (method === 'DELETE') { custom = null; return null; }
        throw new Error('Unexpected mock Cloudflare call');
      },
      async probe(url) { calls.push({ provider: 'probe', url }); return options.probe !== false; },
    },
  };
}

const mutations = f => f.calls.filter(c => c.provider === 'cf' ? c.method !== 'GET' : c.provider === 'ship' ? !c.name.startsWith('get_') : c.method === 'POST');

test('new preview isolates source, database namespace, signing key and publishes only after HTTPS', async () => {
  const f = fixture();
  assert.equal((await runPreview(f.args)).state, 'ready');
  const created = f.calls.find(c => c.name === 'post_projects_by_id_environments');
  assert.deepEqual(created.args.body, { environmentName: 'PR 42', environmentSlug: 'pr-42', environmentType: 'preview', sourceMode: 'branch', gitBranch: pull.head.ref });
  const deploy = f.calls.find(c => c.name === 'post_deployments');
  assert.deepEqual(deploy.args.body, { projectId: child.id, environment: 'preview', branch: pull.head.ref, commitSha: sha });
  const upserts = f.calls.find(c => c.name === 'patch_projects_by_id_env').args.body.upserts;
  assert.equal(upserts.find(v => v.key === 'PAYLOAD_SECRET').value, payloadSecret(f.args.seed, 42));
  assert.equal(upserts.length, 4);
  assert.equal(upserts.find(v => v.key === 'SITE_DEPLOYMENT').value, 'private');
  assert.equal(f.active, '7,42');
  const success = f.calls.findIndex(c => c.body?.state === 'success');
  const originProbe = f.calls.findIndex(c => c.url === 'https://preview-origin-pr-42.mstefan.dev/en/about');
  const publicProbe = f.calls.findIndex(c => c.url === 'https://pr-42.preview.mstefan.dev/en/about');
  const custom = f.calls.findIndex(c => c.provider === 'cf' && c.method === 'PUT');
  assert.ok(originProbe < custom && custom < publicProbe && publicProbe < success);
  assert.equal(f.calls[success].body.environment_url, 'https://pr-42.preview.mstefan.dev');
});

test('signing keys differ between PRs and the seed is never the runtime value', () => {
  const seed = 's'.repeat(32);
  assert.notEqual(payloadSecret(seed, 1), payloadSecret(seed, 2));
  assert.notEqual(payloadSecret(seed, 1), seed);
  assert.equal(payloadSecret(seed, 1).length, 64);
  assert.throws(() => payloadSecret('short', 1), /at least 32/);
});

test('native child routing and readiness defaults are configured only after isolation validation', async () => {
  const f = fixture();
  await runPreview(f.args);
  const route = f.calls.findIndex(c => c.name === 'patch_projects_by_id' && c.args.body.routeStrategy);
  const created = f.calls.findIndex(c => c.name === 'post_projects_by_id_environments');
  const before = f.calls.slice(created + 1, route);
  assert.ok(before.some(c => c.name === 'get_projects_by_id' && c.args.id === child.id));
  assert.deepEqual(f.calls[route].args.body, { routeStrategy: 'loopback-port', readiness: template.readiness });
  assert.equal(f.project.routeStrategy, 'loopback-port');
  assert.deepEqual(f.project.readiness, template.readiness);
});

test('a created child outside the expected namespace receives no recipe patch', async () => {
  const f = fixture();
  const original = f.args.ship;
  f.args.ship = async (name, args) => {
    const response = await original(name, args);
    if (name === 'post_projects_by_id_environments') f.project.slug = 'mstefan-payload';
    return response;
  };
  await assert.rejects(runPreview(f.args), /Created preview isolation mismatch/);
  assert.ok(!f.calls.some(c => c.name === 'patch_projects_by_id' || c.name === 'patch_projects_by_id_env'));
});

test('forks skip every provider mutation', async () => {
  const f = fixture();
  f.pr.head.repo.full_name = 'someone/mstefan-dev';
  assert.deepEqual(await runPreview(f.args), { state: 'skipped', reason: 'fork' });
  assert.deepEqual(mutations(f), []);
});

test('invalid PR identity and injection-like source SHA fail closed', async () => {
  const f = fixture();
  await assert.rejects(runPreview({ ...f.args, number: '42/../../production' }), /PR number invalid/);
  assert.equal(f.calls.length, 0);
  f.pr.head.sha = '$(cat .env)';
  await assert.rejects(runPreview(f.args), /PR source invalid/);
  assert.deepEqual(mutations(f), []);
  assert.throws(() => validatePR({ ...pull, number: 1 }, 42), /identity/);
});

test('production, shared volume slug, altered mounts and runtime recipes are rejected', () => {
  for (const change of [{ id: production }, { id: template.id }, { slug: 'mstefan-payload' }, { groupId: 'prod' },
    { volumes: ['/host:/data'] }, { volumes: ['data:/data', 'production:/other'] }, { runtimeMode: 'bare' },
    { environmentType: 'production' }, { autoDeploy: true }, { startCommand: 'curl secret' }]) {
    assert.throws(() => validateProject({ ...child, ...change }, template, 42));
  }
});

test('production template ID blocks before writes', async () => {
  const f = fixture();
  await assert.rejects(runPreview({ ...f.args, templateId: production }), /TEMPLATE_ID invalid/);
  assert.deepEqual(mutations(f), []);
});

test('replay uses the exact existing successful release without rebuilding', async () => {
  const f = fixture({ existing: true });
  await runPreview(f.args);
  assert.ok(!f.calls.some(c => ['post_deployments', 'post_projects_by_id_environments'].includes(c.name)));
});

test('unexpected integration variables block deployment and remain untouched', async () => {
  const f = fixture({ vars: [{ key: 'NOTION_TOKEN', isSecret: true, value: '********' }] });
  await assert.rejects(runPreview(f.args), /Unexpected preview environment/);
  assert.ok(!f.calls.some(c => ['post_deployments', 'patch_projects_by_id_env'].includes(c.name)));
  assert.ok(f.calls.some(c => c.body?.state === 'error'));
});

test('retained preview reopens using its existing database namespace and release', async () => {
  const f = fixture({ existing: true });
  f.project.enabled = false;
  f.project.disabledAt = '2026-10-09T00:00:00Z';
  assert.equal((await runPreview(f.args)).state, 'ready');
  assert.ok(f.calls.some(c => c.name === 'post_projects_by_id_enable'));
  assert.ok(!f.calls.some(c => ['post_deployments', 'post_projects_by_id_environments'].includes(c.name)));
});

test('successful provider record with altered release mounts cannot publish', async () => {
  const f = fixture();
  f.record.meta.volumes = ['production:/data'];
  await assert.rejects(runPreview(f.args), /release recipe changed/);
  assert.ok(!f.calls.some(c => c.body?.state === 'success' || c.method === 'PUT'));
});

test('close removes only owned public hostname and disables runtime without deleting data', async () => {
  const f = fixture({ existing: true, custom: { id: 'custom_preview', hostname: 'pr-42.preview.mstefan.dev',
    service: 'mstefan-pr-previews', environment: 'production', zone_id: '3352ae407d84634ce4524a7a7629383f' } });
  f.pr.state = 'closed';
  assert.equal((await runPreview(f.args)).state, 'closed');
  assert.equal(f.project.enabled, false);
  assert.equal(f.active, '7');
  assert.ok(f.calls.some(c => c.method === 'DELETE' && c.path.endsWith('/custom_preview')));
  assert.ok(!f.calls.some(c => c.name?.startsWith('delete_') || c.path?.includes('/deployments/999/statuses')));
  assert.ok(!f.calls.some(c => c.path?.includes('dns_records')));
});

test('foreign hostname ownership prevents removal', async () => {
  const f = fixture({ existing: true, custom: { id: 'foreign', hostname: 'pr-42.preview.mstefan.dev', service: 'other', environment: 'production', zone_id: '3352ae407d84634ce4524a7a7629383f' } });
  f.pr.state = 'closed';
  await assert.rejects(runPreview(f.args), /belongs to another resource/);
  assert.ok(!f.calls.some(c => c.method === 'DELETE'));
});

test('native TLS must be active: external TLS state times out and cannot publish a URL', async () => {
  const f = fixture({ tls: false });
  await assert.rejects(runPreview(f.args), /timed out/);
  assert.ok(!f.calls.some(c => c.method === 'PUT' || c.body?.state === 'success'));
  assert.ok(f.calls.some(c => c.body?.state === 'error'));
  assert.ok(f.calls.filter(c => c.name === 'get_domains_by_id').length <= 120);
});

test('saved active TLS state does not override a failed native certificate observation', async () => {
  const f = fixture({ sslVerified: false });
  await assert.rejects(runPreview(f.args), /timed out/);
  assert.ok(!f.calls.some(c => c.method === 'PUT' || c.body?.state === 'success'));
});

test('new SHA arriving during polling prevents stale URL publication', async () => {
  const f = fixture();
  const original = f.args.ship;
  f.args.ship = async (name, args) => {
    const result = await original(name, args);
    if (name === 'post_deployments') f.pr.head.sha = 'b'.repeat(40);
    return result;
  };
  await assert.rejects(runPreview(f.args), /PR changed/);
  assert.ok(!f.calls.some(c => c.body?.state === 'success' || c.method === 'PUT'));
});

test('closed PR arriving during polling completes cleanup', async () => {
  const f = fixture();
  const original = f.args.ship;
  f.args.ship = async (name, args) => {
    const result = await original(name, args);
    if (name === 'post_deployments') f.pr.state = 'closed';
    return result;
  };
  await assert.rejects(runPreview(f.args), /PR changed/);
  assert.equal(f.project.enabled, false);
  assert.ok(!f.calls.some(c => c.body?.state === 'success'));
});

test('close during an unfinished build cancels it before disabling and preserves volumes', async () => {
  const f = fixture();
  f.record.status = 'building';
  const original = f.args.ship;
  f.args.ship = async (name, args) => {
    const result = await original(name, args);
    if (name === 'post_deployments') f.pr.state = 'closed';
    return result;
  };
  await assert.rejects(runPreview(f.args), /PR changed/);
  assert.equal(f.record.status, 'cancelled');
  const cancel = f.calls.findIndex(c => c.name === 'post_deployments_by_id_cancel');
  const disable = f.calls.findIndex(c => c.name === 'post_projects_by_id_disable');
  assert.ok(cancel >= 0 && cancel < disable);
  assert.deepEqual(f.project.volumes, ['data:/data']);
});

test('pending cancellation waits for durable completion before close disables the project', async () => {
  const f = fixture({ existing: true, pendingCancels: 2 });
  f.record.status = 'building';
  f.pr.state = 'closed';
  assert.equal((await runPreview(f.args)).state, 'closed');
  const cancellations = f.calls.filter(c => c.name === 'post_deployments_by_id_cancel');
  assert.equal(cancellations.length, 3);
  assert.ok(f.calls.lastIndexOf(cancellations[2]) < f.calls.findIndex(c => c.name === 'post_projects_by_id_disable'));
});

test('a lost cancellation response with raw cancelled state does not prove quiescence', async () => {
  const f = fixture({ existing: true, cancelTransportError: true });
  f.record.status = 'building';
  f.pr.state = 'closed';
  await assert.rejects(runPreview(f.args), /cancellation did not finish/);
  assert.ok(!f.calls.some(c => c.name === 'post_projects_by_id_disable' || c.body?.state === 'inactive'));
});

test('close replay resumes a previously cancelled worker until durable lease completion', async () => {
  const f = fixture({ existing: true, pendingCancels: 2 });
  f.record.status = 'cancelled';
  f.pr.state = 'closed';
  assert.equal((await runPreview(f.args)).state, 'closed');
  assert.equal(f.calls.filter(c => c.name === 'post_deployments_by_id_cancel').length, 3);
});

test('completed historical cancellation is verified without attempting cancellation again', async () => {
  const f = fixture({ existing: true });
  f.record.status = 'cancelled';
  f.pr.state = 'closed';
  assert.equal((await runPreview(f.args)).state, 'closed');
  assert.ok(f.calls.some(c => c.name === 'get_deployments_by_id_build'));
  assert.ok(!f.calls.some(c => c.name === 'post_deployments_by_id_cancel'));
});

test('lost completed cancellation response recovers from the native worker lease observation', async () => {
  const f = fixture({ existing: true, cancelTransportError: true, cancelCompleted: true });
  f.record.status = 'building';
  f.pr.state = 'closed';
  assert.equal((await runPreview(f.args)).state, 'closed');
  assert.equal(f.calls.filter(c => c.name === 'post_deployments_by_id_cancel').length, 1);
});

test('a build exceeding the readiness budget is cancelled and reports failure', async () => {
  const f = fixture();
  f.record.status = 'building';
  await assert.rejects(runPreview(f.args), /readiness timed out/);
  assert.equal(f.record.status, 'cancelled');
  assert.ok(f.calls.some(c => c.body?.state === 'error'));
  assert.ok(!f.calls.some(c => c.body?.state === 'success'));
});

test('MCP transport fixes workspace scope and refuses provider error payloads', async () => {
  let captured;
  const api = clients({ GITHUB_TOKEN: 'fake-gh', OPENSHIP_TOKEN: 'fake-ship', CLOUDFLARE_API_TOKEN: 'fake-cf' }, async (url, options) => {
    captured = { url, options };
    return Response.json({ jsonrpc: '2.0', result: { content: [{ type: 'text', text: '{"data":[]}' }] } });
  });
  assert.deepEqual(await api.ship('get_projects', { organizationId: 'other', query: {} }), { data: [] });
  assert.equal(captured.url, 'https://openship.mstefan.dev/api/mcp');
  assert.equal(JSON.parse(captured.options.body).params.arguments.organizationId, org);
  assert.equal(captured.options.redirect, 'error');
  const failed = clients({ GITHUB_TOKEN: 'fake-gh', OPENSHIP_TOKEN: 'fake-ship', CLOUDFLARE_API_TOKEN: 'fake-cf' }, async () => Response.json({ result: { isError: true, content: [{ text: 'secret-value' }] } }));
  await assert.rejects(failed.ship('get_projects', {}), /^Error: OpenShip MCP call failed$/);
});

test('trusted workflow never checks out PR code; shared allowlist writes serialize with queued events', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/pr-previews.yml', import.meta.url), 'utf8');
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /ref: \$\{\{ github.event.pull_request.base.sha \}\}/);
  assert.doesNotMatch(workflow, /head.sha|head.ref|npm install|pnpm install|pull_request:\n/);
  assert.match(workflow, /cancel-in-progress: false\n  queue: max/);
  assert.match(workflow, /deployments: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /audience: \$\{\{ vars.MSTEFAN_PREVIEW_TS_AUDIENCE \}\}/);
  assert.doesNotMatch(workflow, /oauth-secret:/);
});
