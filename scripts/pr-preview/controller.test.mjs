import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runPreview, validatePR, validateProject, payloadSecret, originAuthKey, originToken, clients } from './controller.mjs';
import { GATEWAY_IMAGE, gatewayService } from './gateway.mjs';

const sha = 'a'.repeat(40);
const org = 'org_bf9659df-3efc-4659-8893-13baf6533b28';
const production = 'proj_w1kqcgR7eY2EZhht';
const template = {
  id: 'proj_template', organizationId: org, groupId: 'group_preview', serverId: null, deployTarget: 'local', slug: 'mstefan-pr-previews',
  gitProvider: 'github', gitOwner: 'Itakello', gitRepo: 'mstefan-dev', gitBranch: 'master',
  framework: 'docker', packageManager: 'pnpm', hasBuild: true, hasServer: true, rootDirectory: '.', port: 3000, routeStrategy: 'loopback-port', runtimeMode: 'docker',
  sourceKind: 'git', buildKind: 'dockerfile', workloadType: 'web', autoDeploy: false, volumes: ['data:/data'],
  startCommand: null, releaseCommands: null, activeDeploymentId: null, environmentType: 'production', environmentSlug: 'production',
  readiness: { path: '/en/about', port: 3000, timeoutSeconds: 120, stabilizationSeconds: 30 },
};
const child = { ...template, id: 'proj_preview', slug: 'mstefan-pr-previews-pr-42', environmentSlug: 'pr-42',
  environmentType: 'preview', gitBranch: 'feature/example', enabled: true, disabledAt: null };
const gatewayProject = { id: 'proj_gateway', organizationId: org, slug: 'mstefan-pr-preview-gateway-42', serverId: null,
  gitProvider: 'none', framework: 'docker-compose', sourceKind: 'image', buildKind: 'prebuilt', hasBuild: false, port: 8080,
  runtimeMode: 'docker', autoDeploy: false, routeStrategy: 'loopback-port', volumes: [], enabled: true };
const pull = { number: 42, state: 'open', base: { repo: { full_name: 'Itakello/mstefan-dev' } },
  head: { sha, ref: child.gitBranch, repo: { full_name: 'Itakello/mstefan-dev' } } };

function fixture(options = {}) {
  const presentService = service => service && { ...structuredClone(service), environment: Object.fromEntries(
    Object.entries(service.environment ?? {}).map(([key, value]) => [key, value === '' ? '' : '••••••••'])) };
  const calls = [];
  const pr = structuredClone(pull);
  let project = options.existing ? structuredClone(child) : null;
  let domain = null;
  let custom = options.custom ?? null;
  let active = options.initialActive ?? '7';
  let bindings = [{ name: 'ACTIVE_PRS', type: 'plain_text', text: active }];
  let gateway = options.gateway ? structuredClone(options.gateway) : null;
  let gatewaySvc = options.gatewayService ? structuredClone(options.gatewayService) : null;
  let gatewayVars = options.gatewayVars ?? [];
  let connections = options.connections ?? [];
  let gatewayRecord;
  const appDomains = options.appDomains ?? [];
  let vars = options.vars ?? [];
  let clock = 0;
  let cancels = 0;
  let routingReady = false;
  let submitted = Boolean(options.existing);
  let priorRecord;
  let recoveryReads = 0;
  const record = { id: 'dep_preview', organizationId: org, projectId: child.id, commitSha: sha, environment: 'preview', status: 'ready',
    meta: { organizationId: org, runtimeMode: 'docker', build: 'dockerfile', source: 'git', workload: 'web', port: 3000, volumes: ['data:/data'] } };
  if (options.existing) project.activeDeploymentId = record.id;
  return {
    calls, pr, record, get project() { return project; }, get active() { return active; }, get gateway() { return gateway; }, get gatewaySvc() { return gatewaySvc; },
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
        if (name === 'get_projects') return { data: gateway ? [structuredClone(gateway)] : [], total: gateway ? 1 : 0, page: args.query.page, perPage: 100 };
        if (name === 'get_projects_by_id') return { data: structuredClone(args.id === template.id ? template : args.id === gateway?.id ? gateway : project) };
        if (name === 'post_projects') {
          gateway = { ...args.body, id: 'proj_gateway', organizationId: org, runtimeMode: 'docker', autoDeploy: false, enabled: true };
          return { data: structuredClone(gateway) };
        }
        if (name === 'get_projects_by_id_services') return { services: args.id === project?.id ? options.appServices ?? [] : gatewaySvc ? [presentService(gatewaySvc)] : [] };
        if (name === 'post_projects_by_id_services') {
          gatewaySvc = { ...structuredClone(args.body), id: 'svc_gateway', projectId: gateway.id };
          if (!options.missingServiceDomain) domain = { id: 'dom_origin', projectId: gateway.id, hostname: gatewaySvc.customDomain,
            serviceId: options.wrongServiceDomain ? 'svc_foreign' : gatewaySvc.id, targetPort: 8080, externalIngress: false, sslChallenge: 'http-01' };
          return { service: gatewaySvc };
        }
        if (name === 'get_projects_by_id_services_by_serviceId') return { service: presentService(gatewaySvc) };
        if (name === 'get_projects_by_id_services_containers') return { containers: gatewaySvc ? [{ serviceId: gatewaySvc.id,
          status: gateway.enabled ? 'running' : 'stopped', duplicates: [], imageRef: options.gatewayImage ?? GATEWAY_IMAGE }] : [] };
        if (name === 'get_projects_by_id_services_by_serviceId_env') return { vars: structuredClone(gatewayVars) };
        if (name === 'put_projects_by_id_services_by_serviceId_env') {
          gatewayVars = options.gatewaySavedVars ?? args.body.vars.map(v => ({ ...v, value: v.isSecret ? '********' : v.value }));
          return { success: true };
        }
        if (name === 'get_projects_by_id_app_connection') return { data: { outputs: [{ id: project.slug, internal: true, value: `http://${project.slug}:3000` }] } };
        if (name === 'get_projects_by_id_connections') return { data: structuredClone(connections) };
        if (name === 'post_projects_by_id_connections') { connections = [{ ...args.body, id: 'link_gateway', targetProjectId: gateway.id }]; return { data: { connection: connections[0] } }; }
        if (name === 'post_deployments_build_access') {
          gatewayRecord = { id: 'dep_gateway', projectId: gateway.id, environment: 'production', status: options.gatewayStatus ?? 'ready',
            meta: { serverId: project.serverId, runtimeMode: 'docker', composeServices: options.missingGatewaySnapshot ? undefined
              : (options.gatewaySnapshot ?? [{ ...gatewayService(42), commandArgv: null, everDeployed: false }]).map(presentService) } };
          gateway.activeDeploymentId = gatewayRecord.id;
          if (options.gatewaySubmissionError) throw new Error('Lost gateway response');
          return { success: true, project_id: gateway.id, deployment_id: gatewayRecord.id };
        }
        if (name === 'get_projects_by_id_environments') return { data: project ? [{ id: project.id, slug: 'pr-42' }] : [] };
        if (name === 'post_projects_by_id_environments') {
          project = structuredClone(child);
          project.routeStrategy = 'auto';
          project.readiness = null;
          return { success: true, data: { id: project.id, slug: project.environmentSlug } };
        }
        if (name === 'get_projects_by_id_env') return { data: args.query.environment === 'production' ? [] : structuredClone(vars) };
        if (name === 'patch_projects_by_id_env') { vars = args.body.upserts.map(v => ({ ...v, value: v.isSecret ? '********' : v.value })); return { data: vars }; }
        if (name === 'get_deployments_by_id') return { data: structuredClone(args.id === gatewayRecord?.id ? gatewayRecord : record) };
        if (name === 'get_deployments_by_id_build') {
          if (args.id === gatewayRecord?.id) return { deployment_id: gatewayRecord.id, project_id: gateway.id, deploymentStatus: gatewayRecord.status, completionPending: false, cancellationPending: false };
          const pending = (options.cancelTransportError && !options.cancelCompleted) || cancels < (options.pendingCancels ?? 0);
          return { deployment_id: record.id, project_id: child.id, deploymentStatus: record.status,
            completionPending: pending, cancellationPending: record.status === 'cancelled' && pending };
        }
        if (name === 'get_deployments') {
          if (args.query.projectId === gateway?.id) return { rows: gatewayRecord ? [structuredClone(gatewayRecord)] : [], total: gatewayRecord ? 1 : 0 };
          let rows = submitted ? [structuredClone(record)] : [];
          if (priorRecord) {
            recoveryReads++;
            rows = recoveryReads <= (options.recoveryDelayReads ?? 0) ? [structuredClone(priorRecord)] : [...rows, structuredClone(priorRecord)];
          }
          if (options.historyOverride && recoveryReads) rows = options.historyOverride;
          return { rows, total: rows.length, page: args.query.page, perPage: args.query.perPage };
        }
        if (name === 'post_deployments_by_id_cancel') {
          if (args.id === gatewayRecord?.id) { gatewayRecord.status = 'cancelled'; return { success: true, pending: false, status: 'cancelled' }; }
          if (options.cancelReconcilingRejected && record.status === 'reconciling') throw new Error('Cannot cancel a deployment that is not in progress');
          record.status = 'cancelled';
          cancels++;
          if (options.cancelTransportError) throw new Error('Simulated transport error');
          return cancels <= (options.pendingCancels ?? 0)
            ? { success: false, pending: true, status: 'cancelling' }
            : { success: true, pending: false, status: 'cancelled' };
        }
        if (name === 'get_deployments_by_id_info') return { data: { status: (args.id === gatewayRecord?.id ? gateway : project).enabled ? 'running' : 'exited' } };
        if (name === 'post_deployments') {
          if (!options.noAcceptance) {
            if (submitted) { priorRecord = structuredClone(record); record.id = 'dep_recovered'; }
            submitted = true;
            record.commitSha = sha;
            if (options.submittedStatus) record.status = options.submittedStatus;
            if (record.status === 'ready') project.activeDeploymentId = record.id;
          }
          if (options.submissionError) throw new Error('Simulated lost submission response');
          return options.submissionResponse ?? { data: { project_id: project.id, deployment_id: record.id } };
        }
        if (name === 'patch_projects_by_id') { Object.assign(project, args.body); return { data: project }; }
        if (name === 'post_projects_by_id_enable') { const target = args.id === gateway?.id ? gateway : project; target.enabled = true; target.disabledAt = null; return { data: target }; }
        if (name === 'post_projects_by_id_disable') { const target = args.id === gateway?.id ? gateway : project; target.enabled = false; target.disabledAt = '2026-10-09T00:00:00Z'; return { data: target }; }
        if (name === 'get_domains') return { data: args.query.projectId === project.id ? structuredClone(appDomains) : domain ? [domain] : [] };
        if (name === 'delete_domains_by_id') { const index = appDomains.findIndex(d => d.id === args.id); assert.ok(index >= 0); appDomains.splice(index, 1); return { success: true }; }
        if (name === 'post_domains') { domain = { ...args.body, id: 'dom_origin' }; return { data: domain }; }
        if (name === 'post_domains_by_id_verify') {
          Object.assign(domain, { verified: true, sslStatus: options.tls === false ? 'external' : 'active', sslExpiresAt: '2099-01-01T00:00:00Z' });
          return { verified: true };
        }
        if (name === 'post_projects_by_id_routing_retry') {
          const result = options.routingResult ?? { ok: true };
          routingReady = result.ok === true;
          return result;
        }
        if (name === 'get_domains_by_id') return { data: structuredClone(domain) };
        if (name === 'post_domains_by_id_verify_ssl') return { data: { domain: domain.hostname, sslStatus: domain.sslStatus,
          expiresAt: domain.sslExpiresAt, verified: options.sslVerified !== false } };
        throw new Error('Unexpected mock OpenShip call');
      },
      async cf(method, path, body) {
        calls.push({ provider: 'cf', method, path, body });
        if (path.includes('/settings')) {
          if (method === 'PATCH') { active = body.bindings.find(b => b.name === 'ACTIVE_PRS').text; bindings = body.bindings.map(b => b.type === 'secret_text' ? { name: b.name, type: b.type } : { ...b }); }
          return { bindings: structuredClone(bindings) };
        }
        if (path.includes('/dns_records')) return [];
        if (method === 'GET') return custom ? [custom] : [];
        if (method === 'PUT') { custom = { ...body, id: 'custom_preview' }; return custom; }
        if (method === 'DELETE') { custom = null; return null; }
        throw new Error('Unexpected mock Cloudflare call');
      },
      async probe(url, publicPreview, optionsArg) {
        calls.push({ provider: 'probe', url, publicPreview, options: optionsArg });
        if (optionsArg?.expectedStatus === 404) return options.unauthorizedRejected !== false;
        return options.probe !== false && (!options.requireRouting || routingReady);
      },
    },
  };
}

const mutations = f => f.calls.filter(c => c.provider === 'cf' ? c.method !== 'GET' : c.provider === 'ship' ? !c.name.startsWith('get_') : c.method === 'POST');

test('trusted source-free gateway receives only a per-PR token and uses the validated internal app connection', async () => {
  const f = fixture({ initialActive: '7,42', appDomains: [{ id: 'dom_old', projectId: child.id, hostname: 'preview-origin-pr-42.mstefan.dev' }] });
  await runPreview(f.args);
  assert.equal(f.gateway.gitProvider, 'none');
  assert.equal(f.gateway.gitRepo, undefined);
  assert.deepEqual(f.gateway.volumes, []);
  assert.equal(f.gateway.routeStrategy, 'loopback-port');
  assert.deepEqual(f.gatewaySvc.advanced, gatewayService(42).advanced);
  const token = f.calls.find(c => c.name === 'put_projects_by_id_services_by_serviceId_env');
  assert.deepEqual(token.args.body, { environment: 'production', vars: [{ key: 'PREVIEW_ORIGIN_TOKEN', value: originToken(f.args.seed, 42), isSecret: true },
    { key: 'NGINX_ENVSUBST_FILTER', value: '^PREVIEW_ORIGIN_TOKEN$', isSecret: false }] });
  const appVars = f.calls.find(c => c.name === 'patch_projects_by_id_env').args.body.upserts;
  assert.ok(!appVars.some(v => v.key === 'PREVIEW_ORIGIN_TOKEN' || v.value === originAuthKey(f.args.seed)));
  const key = f.calls.find(c => c.provider === 'cf' && c.method === 'PATCH').body.bindings.find(b => b.name === 'ORIGIN_AUTH_KEY');
  assert.deepEqual(key, { name: 'ORIGIN_AUTH_KEY', type: 'secret_text', text: originAuthKey(f.args.seed) });
  const deploy = f.calls.find(c => c.name === 'post_deployments_build_access');
  assert.deepEqual(deploy.args.body, { projectId: f.gateway.id, environment: 'production', deployTarget: 'local', runtimeMode: 'docker',
    serviceDeploymentMode: 'services', serviceIds: ['svc_gateway'], publicEndpoints: [] });
  const removed = f.calls.findIndex(c => c.name === 'delete_domains_by_id');
  const appDeploy = f.calls.findIndex(c => c.name === 'post_deployments');
  const firstWithdraw = f.calls.findIndex(c => c.provider === 'cf' && c.method === 'PATCH' && c.body.bindings[0].text === '7');
  assert.ok(firstWithdraw < removed && removed < appDeploy);
  assert.ok(!f.calls.some(c => c.name === 'post_domains'));
  const originProbes = f.calls.filter(c => c.provider === 'probe' && c.url.includes('preview-origin'));
  assert.deepEqual(originProbes.map(c => c.options), [{ token: originToken(f.args.seed, 42), expectedStatus: 200 }, { expectedStatus: 404 }]);
});

test('origin signing keys are separated from Payload and each PR gateway token', () => {
  const seed = 's'.repeat(32);
  assert.notEqual(originAuthKey(seed), payloadSecret(seed, 42));
  assert.notEqual(originAuthKey(seed), originToken(seed, 42));
  assert.notEqual(originToken(seed, 42), originToken(seed, 95));
});

test('an origin that accepts unauthenticated requests cannot be published', async () => {
  const f = fixture({ unauthorizedRejected: false });
  await assert.rejects(runPreview(f.args), /readiness timed out/);
  assert.equal(f.active, '7');
  assert.ok(!f.calls.some(c => c.body?.state === 'success' || c.provider === 'cf' && c.method === 'PUT'));
});

test('gateway requires its native service-owned origin and never creates a project route fallback', async () => {
  for (const options of [{ missingServiceDomain: true }, { wrongServiceDomain: true }]) {
    const f = fixture(options);
    await assert.rejects(runPreview(f.args), /Origin domain identity mismatch/);
    assert.equal(f.active, '7');
    assert.ok(!f.calls.some(c => c.name === 'post_domains' || c.name === 'post_domains_by_id_verify' || c.body?.state === 'success'));
  }
});

test('gateway isolation rejects Git source, persistent volumes and shared-network route selection', async () => {
  for (const change of [{ gitRepo: 'mstefan-dev' }, { volumes: ['data:/data'] }, { routeStrategy: 'container-ip' }]) {
    const f = fixture({ gateway: { ...gatewayProject, ...change } });
    await assert.rejects(runPreview(f.args), /Gateway project isolation mismatch/);
    assert.ok(!f.calls.some(c => c.name === 'post_deployments_build_access' || c.body?.state === 'success'));
  }
});

test('gateway discovery rejects production identity before any resource read', async () => {
  const f = fixture({ gateway: { ...gatewayProject, id: production } });
  await assert.rejects(runPreview(f.args), /Gateway project identity invalid/);
  assert.ok(!f.calls.some(c => c.args?.id === production));
});

test('gateway rejects unpinned service source and extra service environment keys', async () => {
  for (const options of [
    { gatewayService: { ...gatewayService(42), id: 'svc_gateway', projectId: gatewayProject.id, image: 'nginx:latest' } },
    { gatewayVars: [{ key: 'UNRELATED_TOKEN', isSecret: true }] },
  ]) {
    const f = fixture({ gateway: gatewayProject, ...options });
    await assert.rejects(runPreview(f.args), /Gateway service recipe changed|Unexpected gateway service variables/);
    assert.ok(!f.calls.some(c => c.name === 'post_deployments_build_access' || c.body?.state === 'success'));
  }
});

test('gateway publication requires the actual pinned runtime image', async () => {
  const f = fixture({ gatewayImage: 'nginx:latest' });
  await assert.rejects(runPreview(f.args), /Gateway runtime image mismatch/);
  assert.equal(f.active, '7');
  assert.ok(!f.calls.some(c => c.body?.state === 'success' || c.provider === 'probe'));
});

test('gateway publication requires the exact frozen service configuration', async () => {
  for (const options of [
    { missingGatewaySnapshot: true },
    { gatewaySnapshot: [{ ...gatewayService(42), image: 'nginx:latest' }] },
    { gatewaySnapshot: [{ ...gatewayService(42), advanced: { files: [{ path: '/etc/nginx/templates/default.conf.template', content: 'unguarded proxy' }] } }] },
    { gatewaySnapshot: [{ ...gatewayService(42), environment: { EXTRA_FILTER: '.*' } }] },
  ]) {
    const f = fixture(options);
    await assert.rejects(runPreview(f.args), /Gateway frozen service configuration missing|Gateway service recipe changed|Gateway service environment changed/);
    assert.equal(f.active, '7');
    assert.ok(!f.calls.some(c => c.body?.state === 'success' || c.provider === 'probe'));
  }
});

test('gateway scoped environment verifies the literal nonsecret filter and secret token classifications', async () => {
  for (const filter of [
    { key: 'NGINX_ENVSUBST_FILTER', value: '.*', isSecret: false },
    { key: 'NGINX_ENVSUBST_FILTER', value: '••••••••', isSecret: true },
  ]) {
    const f = fixture({ gatewaySavedVars: [{ key: 'PREVIEW_ORIGIN_TOKEN', value: '********', isSecret: true }, filter] });
    await assert.rejects(runPreview(f.args), /Gateway environment storage unverified/);
    assert.ok(!f.calls.some(c => c.name === 'post_deployments_build_access' || c.body?.state === 'success'));
  }
  const f = fixture();
  await runPreview(f.args);
  assert.deepEqual(f.gatewaySvc.environment, {});
});

test('native frozen configuration normalization preserves property-order independence and null argv', async () => {
  const recipe = gatewayService(42);
  const gatewaySnapshot = [{ ...recipe, commandArgv: null, everDeployed: false,
    advanced: { files: recipe.advanced.files.map(file => ({ content: file.content, path: file.path })) } }];
  const f = fixture({ gatewaySnapshot });
  assert.equal((await runPreview(f.args)).state, 'ready');
});

test('app compose sources and persisted services are rejected before any deployment', async () => {
  const f = fixture({ existing: true, appServices: [{ id: 'svc_untrusted', projectId: child.id }] });
  await assert.rejects(runPreview(f.args), /Unexpected preview app services/);
  assert.ok(!f.calls.some(c => c.name === 'post_deployments' || c.name === 'post_deployments_build_access'));
  assert.throws(() => validateProject({ ...child, composePath: 'docker-compose.yml' }, template, 42), /compose source changed/);
});

test('lost gateway submission is recovered without resubmission', async () => {
  const f = fixture({ gatewaySubmissionError: true });
  assert.equal((await runPreview(f.args)).state, 'ready');
  assert.equal(f.calls.filter(c => c.name === 'post_deployments_build_access').length, 1);
});

test('close stops the gateway and app while retaining the app volume', async () => {
  const f = fixture();
  await runPreview(f.args);
  f.pr.state = 'closed';
  assert.equal((await runPreview(f.args)).state, 'closed');
  assert.equal(f.gateway.enabled, false);
  assert.equal(f.project.enabled, false);
  assert.deepEqual(f.project.volumes, ['data:/data']);
  assert.ok(f.calls.some(c => c.name === 'get_projects_by_id_services_containers' && c.args.id === f.gateway.id));
  assert.ok(!f.calls.some(c => c.name?.startsWith('delete_projects')));
});

test('lost accepted submission is recovered once from fresh exact history and verified before publication', async () => {
  const f = fixture({ existing: true, initialActive: '7,42', submissionError: true, recoveryDelayReads: 2 });
  f.record.commitSha = 'b'.repeat(40);
  assert.equal((await runPreview(f.args)).state, 'ready');
  assert.equal(f.calls.filter(c => c.name === 'post_deployments').length, 1);
  const withdraw = f.calls.findIndex(c => c.provider === 'cf' && c.method === 'PATCH' && c.body.bindings[0].text === '7');
  const submit = f.calls.findIndex(c => c.name === 'post_deployments');
  const verified = f.calls.findIndex(c => c.name === 'get_deployments_by_id_info' && c.args.id === 'dep_recovered');
  const publish = f.calls.findIndex(c => c.body?.state === 'success');
  assert.ok(withdraw < submit && submit < verified && verified < publish);
});

test('uncertain submission cannot reuse old history or leave an unverified preview public', async () => {
  const f = fixture({ existing: true, initialActive: '7,42', submissionError: true, noAcceptance: true });
  f.record.status = 'building';
  await assert.rejects(runPreview(f.args), /submission could not be reconciled within one minute/);
  assert.equal(f.calls.filter(c => c.name === 'post_deployments').length, 1);
  assert.ok(f.calls.filter(c => c.name === 'get_deployments').length <= 5);
  assert.equal(f.active, '7');
  assert.ok(!f.calls.some(c => c.body?.state === 'success' || c.provider === 'probe'));
});

test('malformed accepted response recovers through history and still rejects unsafe runtime recipe', async () => {
  const f = fixture({ submissionResponse: { data: { project_id: child.id } }, initialActive: '7,42' });
  f.record.meta.volumes = ['production:/data'];
  await assert.rejects(runPreview(f.args), /release recipe changed/);
  assert.equal(f.calls.filter(c => c.name === 'post_deployments').length, 1);
  assert.equal(f.active, '7');
  assert.ok(!f.calls.some(c => c.body?.state === 'success'));
});

test('lost submission recovered in reconciling is cancelled after failed verification', async () => {
  const f = fixture({ submissionError: true, submittedStatus: 'reconciling', initialActive: '7,42' });
  await assert.rejects(runPreview(f.args), /readiness timed out/);
  assert.equal(f.calls.filter(c => c.name === 'post_deployments').length, 1);
  assert.ok(f.calls.some(c => c.name === 'post_deployments_by_id_cancel' && c.args.id === f.record.id));
  assert.equal(f.record.status, 'cancelled');
  assert.equal(f.active, '7');
  assert.ok(!f.calls.some(c => c.body?.state === 'success'));
});

test('recovered cancelled submission waits for its durable worker lease before reporting error', async () => {
  const f = fixture({ submissionError: true, submittedStatus: 'cancelled', pendingCancels: 2, initialActive: '7,42' });
  await assert.rejects(runPreview(f.args), /deployment failed or requires action/);
  assert.equal(f.calls.filter(c => c.name === 'post_deployments_by_id_cancel').length, 3);
  assert.equal(f.active, '7');
  assert.ok(!f.calls.some(c => c.body?.state === 'success'));
});

test('close cancels reconciling releases before disabling retained runtime', async () => {
  const f = fixture({ existing: true });
  f.record.status = 'reconciling';
  f.pr.state = 'closed';
  assert.equal((await runPreview(f.args)).state, 'closed');
  const cancel = f.calls.findIndex(c => c.name === 'post_deployments_by_id_cancel');
  const disable = f.calls.findIndex(c => c.name === 'post_projects_by_id_disable');
  assert.ok(cancel >= 0 && cancel < disable);
});

test('native rejection of a persistent reconciling release fails closed within the cancellation bound', async () => {
  const f = fixture({ existing: true, initialActive: '7,42', cancelReconcilingRejected: true });
  f.record.status = 'reconciling';
  f.pr.state = 'closed';
  await assert.rejects(runPreview(f.args), /cancellation did not finish within five minutes/);
  assert.equal(f.active, '7');
  assert.equal(f.calls.filter(c => c.name === 'post_deployments_by_id_cancel').length, 20);
  assert.ok(!f.calls.some(c => c.name === 'post_projects_by_id_disable' || c.body?.state === 'inactive'));
});

test('uncertain submission rejects history belonging to another project', async () => {
  const f = fixture({ existing: true, initialActive: '7,42', submissionError: true,
    historyOverride: [{ id: 'dep_foreign', projectId: production, environment: 'preview', commitSha: sha }] });
  f.record.commitSha = 'b'.repeat(40);
  await assert.rejects(runPreview(f.args), /history release mismatch/);
  assert.equal(f.active, '7');
  assert.equal(f.calls.filter(c => c.name === 'post_deployments').length, 1);
  assert.ok(!f.calls.some(c => c.body?.state === 'success' || c.name === 'post_deployments_by_id_cancel'));
});

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

test('newly verified origin is routed before readiness and publication', async () => {
  const f = fixture({ requireRouting: true });
  assert.equal((await runPreview(f.args)).state, 'ready');
  const verify = f.calls.findIndex(c => c.name === 'post_domains_by_id_verify');
  const repair = f.calls.findIndex(c => c.name === 'post_projects_by_id_routing_retry');
  const probe = f.calls.findIndex(c => c.provider === 'probe');
  assert.ok(verify < repair && repair < probe);
  assert.deepEqual(f.calls[repair].args, { id: 'proj_gateway' });
});

test('rejected or malformed routing repair prevents preview publication', async () => {
  for (const routingResult of [{ ok: false }, { ok: 'true' }]) {
    const f = fixture({ requireRouting: true, routingResult });
    await assert.rejects(runPreview(f.args), /origin routing refresh failed/);
    assert.ok(!f.calls.some(c => c.provider === 'probe' || c.method === 'PUT' || c.body?.state === 'success'));
    assert.ok(f.calls.some(c => c.body?.state === 'error'));
  }
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
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}/);
  assert.doesNotMatch(workflow, /github.event.pull_request.base.sha/);
  assert.doesNotMatch(workflow, /head.sha|head.ref|npm install|pnpm install|pull_request:\n/);
  assert.match(workflow, /cancel-in-progress: false\n  queue: max/);
  assert.match(workflow, /deployments: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /ping: 100\.111\.250\.54/);
  assert.match(workflow, /audience: \$\{\{ vars.MSTEFAN_PREVIEW_TS_AUDIENCE \}\}/);
  assert.doesNotMatch(workflow, /oauth-secret:/);
});
