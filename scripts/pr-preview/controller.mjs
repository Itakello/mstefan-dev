import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const REPO = 'Itakello/mstefan-dev';
const ORG = 'org_bf9659df-3efc-4659-8893-13baf6533b28';
const PRODUCTION = 'proj_w1kqcgR7eY2EZhht';
const TEMPLATE_SLUG = 'mstefan-pr-previews';
const ACCOUNT = '17adf7cbee8c9709bd3ffb656890f985';
const ZONE = '3352ae407d84634ce4524a7a7629383f';
const WORKER = 'mstefan-pr-previews';
const SHA = /^[0-9a-f]{40}$/;
const ID = /^[a-zA-Z0-9_-]+$/;
const budget = 30 * 60 * 1000;
const interval = 15_000;
const allowedEnv = new Set(['PAYLOAD_SECRET', 'PAYLOAD_DATA_DIR', 'NODE_ENV', 'SITE_DEPLOYMENT']);
const inFlight = new Set(['pending', 'queued', 'building', 'deploying']);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const data = response => response?.data;

export function validatePR(pr, number) {
  assert(Number.isSafeInteger(number) && number > 0 && pr?.number === number, 'PR identity mismatch');
  assert(pr.base?.repo?.full_name === REPO && ['open', 'closed'].includes(pr.state), 'PR repository or state mismatch');
  if (pr.head?.repo?.full_name !== REPO) return false;
  assert(SHA.test(pr.head.sha) && typeof pr.head.ref === 'string' && pr.head.ref.length > 0, 'PR source invalid');
  return true;
}

export function validateProject(project, template, number) {
  assert(project && ID.test(project.id) && project.id !== PRODUCTION, 'Preview project identity invalid');
  const expected = {
    organizationId: ORG, gitProvider: 'github', gitOwner: 'Itakello', gitRepo: 'mstefan-dev',
    framework: 'docker', packageManager: 'pnpm', hasBuild: true, hasServer: true, rootDirectory: '.', port: 3000, routeStrategy: 'loopback-port',
    runtimeMode: 'docker', sourceKind: 'git', buildKind: 'dockerfile', workloadType: 'web', autoDeploy: false,
    slug: number ? `${TEMPLATE_SLUG}-pr-${number}` : TEMPLATE_SLUG,
    environmentType: number ? 'preview' : 'production', environmentSlug: number ? `pr-${number}` : 'production',
  };
  assert(Object.entries(expected).every(([key, value]) => project[key] === value), 'Preview recipe or namespace changed');
  assert(JSON.stringify(project.volumes) === JSON.stringify(['data:/data']), 'Preview storage changed');
  assert(project.startCommand == null && project.releaseCommands == null, 'Preview startup override changed');
  assert(project.readiness?.path === '/en/about' && project.readiness.port === 3000
    && project.readiness.timeoutSeconds === 120 && project.readiness.stabilizationSeconds === 30, 'Preview readiness recipe changed');
  if (number) assert(project.id !== template.id && project.groupId === template.groupId, 'Preview isolation invalid');
  else assert(project.activeDeploymentId == null, 'Preview template must remain undeployed');
  return project;
}

export function payloadSecret(seed, number) {
  assert(typeof seed === 'string' && seed.length >= 32, 'PREVIEW_PAYLOAD_SECRET must contain at least 32 characters');
  return createHmac('sha256', seed).update(`${REPO}:pr-${number}:payload:v1`).digest('hex');
}

function validateVars(vars) {
  assert(Array.isArray(vars) && vars.every(v => allowedEnv.has(v.key)) && new Set(vars.map(v => v.key)).size === vars.length,
    'Unexpected preview environment variables');
}

export async function runPreview({ number, templateId, seed, gh, ship, cf, probe, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  assert(Number.isSafeInteger(number) && number > 0, 'PR number invalid');
  const prPath = `/repos/${REPO}/pulls/${number}`;
  let pr = await gh('GET', prPath);
  if (!validatePR(pr, number)) return { state: 'skipped', reason: 'fork' };
  assert(ID.test(templateId ?? '') && templateId !== PRODUCTION, 'OPENSHIP_PREVIEW_TEMPLATE_ID invalid');
  const envName = `pr-${number}`;
  const hostname = `${envName}.preview.mstefan.dev`;
  const origin = `preview-origin-${envName}.mstefan.dev`;
  const workerPath = `/accounts/${ACCOUNT}/workers/scripts/${WORKER}/settings`;
  const domainsPath = `/accounts/${ACCOUNT}/workers/domains`;
  const template = validateProject(data(await ship('get_projects_by_id', { id: templateId })));
  assert(template.id === templateId, 'Preview template identity mismatch');
  const siblings = data(await ship('get_projects_by_id_environments', { id: templateId }));
  assert(Array.isArray(siblings), 'Preview environments response invalid');
  const matches = siblings.filter(row => row.slug === envName);
  assert(matches.length <= 1, 'Duplicate preview environment');
  let project = matches.length ? validateProject(data(await ship('get_projects_by_id', { id: matches[0].id })), template, number) : null;

  async function active(enabled) {
    const settings = await cf('GET', workerPath);
    assert(Array.isArray(settings.bindings) && settings.bindings.length === 1
      && settings.bindings[0].name === 'ACTIVE_PRS' && settings.bindings[0].type === 'plain_text', 'Worker bindings changed');
    const numbers = (settings.bindings[0].text || '').split(',').filter(Boolean);
    assert(numbers.every(n => /^[1-9]\d*$/.test(n)), 'Worker allowlist invalid');
    const next = new Set(numbers);
    if (enabled) next.add(String(number)); else next.delete(String(number));
    const text = [...next].sort((a, b) => Number(a) - Number(b)).join(',');
    if (text !== settings.bindings[0].text) {
      await cf('PATCH', workerPath, { bindings: [{ name: 'ACTIVE_PRS', type: 'plain_text', text }] });
      const check = await cf('GET', workerPath);
      assert(check.bindings?.find(b => b.name === 'ACTIVE_PRS')?.text === text, 'Worker allowlist write unverified');
    }
  }

  async function customDomain() {
    const rows = await cf('GET', `${domainsPath}?hostname=${hostname}`);
    assert(Array.isArray(rows), 'Custom domains response invalid');
    const matches = rows.filter(row => row.hostname === hostname);
    assert(matches.length <= 1, 'Duplicate preview hostname');
    if (matches.length) assert(matches[0].service === WORKER && matches[0].environment === 'production' && matches[0].zone_id === ZONE,
      'Preview hostname belongs to another resource');
    return matches[0];
  }

  async function close() {
    await active(false);
    const domain = await customDomain();
    if (domain) {
      assert(ID.test(domain.id), 'Custom domain identity invalid');
      await cf('DELETE', `${domainsPath}/${domain.id}`);
      assert(!await customDomain(), 'Preview hostname removal unverified');
    }
    if (project) {
      let complete = false;
      for (let page = 1; page <= 10; page++) {
        const history = await ship('get_deployments', { query: { projectId: project.id, environment: 'preview', perPage: 100, page } });
        assert(Array.isArray(history.rows) && Number.isSafeInteger(history.total), 'OpenShip deployment history invalid');
        for (const record of history.rows) {
          assert(record.projectId === project.id && record.environment === 'preview' && ID.test(record.id), 'Preview cleanup release mismatch');
          if (inFlight.has(record.status) || (record.status === 'cancelled' && !await settled(record.id, 'cancelled'))) await cancel(record.id);
        }
        if (page * 100 >= history.total) { complete = true; break; }
      }
      assert(complete, 'OpenShip deployment history exceeds cleanup bound');
      await ship('post_projects_by_id_disable', { id: project.id });
      const disabled = validateProject(data(await ship('get_projects_by_id', { id: project.id })), template, number);
      if (disabled.activeDeploymentId) {
        assert(disabled.enabled === false && disabled.disabledAt, 'Preview runtime disable unverified');
        const info = data(await ship('get_deployments_by_id_info', { id: disabled.activeDeploymentId }));
        assert(['stopped', 'exited', 'missing'].includes(info?.status), 'Preview container still active');
      }
    }
    for (let page = 1; page <= 10; page++) {
      const deployments = await gh('GET', `/repos/${REPO}/deployments?environment=${envName}&per_page=100&page=${page}`);
      assert(Array.isArray(deployments), 'GitHub deployment list invalid');
      for (const deployment of deployments) {
        if (deployment.environment === envName && deployment.payload?.owner === WORKER && deployment.payload?.pr === number) {
          await gh('POST', `/repos/${REPO}/deployments/${deployment.id}/statuses`, { state: 'inactive', description: 'PR closed; runtime disabled and data retained' });
        }
      }
      if (deployments.length < 100) return { state: 'closed' };
    }
    throw new Error('GitHub deployment history exceeds cleanup bound');
  }

  async function settled(id, status) {
    const build = await ship('get_deployments_by_id_build', { id });
    assert(build?.deployment_id === id && build.project_id === project.id, 'Preview worker identity mismatch');
    return build.deploymentStatus === status && build.completionPending === false
      && (status !== 'cancelled' || build.cancellationPending === false);
  }

  async function cancel(id) {
    const deadline = now() + 5 * 60 * 1000;
    while (now() < deadline) {
      let outcome;
      try { outcome = await ship('post_deployments_by_id_cancel', { id }); }
      catch {
        const record = data(await ship('get_deployments_by_id', { id }));
        assert(record?.id === id && record.projectId === project.id, 'Preview cancellation identity mismatch');
        // Activation can win the cancellation race; close then stops that ready release.
        if (record.status === 'ready' && await settled(id, 'ready')) return;
        if (record.status === 'cancelled' && await settled(id, 'cancelled')) return;
        assert(['ready', 'cancelled'].includes(record.status) || inFlight.has(record.status), 'Preview cancellation failed');
      }
      if (outcome) {
        const done = outcome.success === true && outcome.pending === false && outcome.status === 'cancelled';
        if (done && await settled(id, 'cancelled')) return;
        assert(done || (outcome.success === false && outcome.pending === true && outcome.status === 'cancelling'), 'Preview cancellation result invalid');
      }
      await sleep(interval);
    }
    throw new Error('Preview cancellation did not finish within five minutes');
  }

  if (pr.state === 'closed') return close();
  const secret = payloadSecret(seed, number);
  const sha = pr.head.sha;
  const branch = pr.head.ref;
  async function current() {
    pr = await gh('GET', prPath);
    assert(validatePR(pr, number), 'PR source changed');
    assert(pr.state === 'open' && pr.head.sha === sha && pr.head.ref === branch, 'PR changed during deployment');
  }
  const deployment = await gh('POST', `/repos/${REPO}/deployments`, {
    ref: sha, environment: envName, auto_merge: false, required_contexts: [], transient_environment: true,
    production_environment: false, payload: { owner: WORKER, pr: number }, description: 'Isolated OpenShip PR preview',
  });
  assert(Number.isSafeInteger(deployment.id) && deployment.id > 0, 'GitHub deployment identity invalid');
  const statusPath = `/repos/${REPO}/deployments/${deployment.id}/statuses`;
  await gh('POST', statusPath, { state: 'in_progress', description: 'Preparing isolated preview' });
  let submittedId;
  try {
    await current();
    if (!project) {
      const created = data(await ship('post_projects_by_id_environments', { id: templateId, body: {
        environmentName: `PR ${number}`, environmentSlug: envName, environmentType: 'preview', sourceMode: 'branch', gitBranch: branch,
      } }));
      assert(created && ID.test(created.id) && created.id !== PRODUCTION && created.id !== templateId, 'Created preview identity invalid');
      const isolated = data(await ship('get_projects_by_id', { id: created.id }));
      assert(isolated?.id === created.id && isolated.organizationId === ORG && isolated.groupId === template.groupId
        && isolated.slug === `${TEMPLATE_SLUG}-${envName}` && isolated.environmentSlug === envName && isolated.environmentType === 'preview'
        && isolated.gitProvider === 'github' && isolated.gitOwner === 'Itakello' && isolated.gitRepo === 'mstefan-dev'
        && isolated.gitBranch === branch && isolated.activeDeploymentId == null, 'Created preview isolation mismatch');
      // Native environment creation omits routing and readiness from the inherited recipe.
      await ship('patch_projects_by_id', { id: isolated.id, body: { routeStrategy: 'loopback-port', readiness: template.readiness } });
      project = validateProject(data(await ship('get_projects_by_id', { id: isolated.id })), template, number);
    }
    validateVars(data(await ship('get_projects_by_id_env', { id: project.id, query: { environment: 'production' } })));
    validateVars(data(await ship('get_projects_by_id_env', { id: project.id, query: { environment: 'preview' } })));
    await ship('patch_projects_by_id_env', { id: project.id, body: { environment: 'preview', deletes: [], upserts: [
      { key: 'PAYLOAD_SECRET', value: secret, isSecret: true }, { key: 'PAYLOAD_DATA_DIR', value: '/data' }, { key: 'NODE_ENV', value: 'production' },
      { key: 'SITE_DEPLOYMENT', value: 'private' },
    ] } });
    const vars = data(await ship('get_projects_by_id_env', { id: project.id, query: { environment: 'preview' } }));
    validateVars(vars);
    assert(vars.length === 4 && vars.some(v => v.key === 'PAYLOAD_SECRET' && v.isSecret === true)
      && vars.some(v => v.key === 'PAYLOAD_DATA_DIR' && v.value === '/data')
      && vars.some(v => v.key === 'NODE_ENV' && v.value === 'production')
      && vars.some(v => v.key === 'SITE_DEPLOYMENT' && v.value === 'private'), 'Preview environment write unverified');
    if (project.gitBranch !== branch) await ship('patch_projects_by_id', { id: project.id, body: { gitBranch: branch } });
    if (project.enabled === false) await ship('post_projects_by_id_enable', { id: project.id });
    await current();
    let record = project.activeDeploymentId ? data(await ship('get_deployments_by_id', { id: project.activeDeploymentId })) : null;
    let deploymentId;
    if (record?.projectId === project.id && record.commitSha === sha && record.status === 'ready') deploymentId = record.id;
    else {
      const accepted = data(await ship('post_deployments', { body: { projectId: project.id, environment: 'preview', branch, commitSha: sha } }));
      assert(accepted?.project_id === project.id && ID.test(accepted.deployment_id), 'OpenShip deployment identity invalid');
      deploymentId = accepted.deployment_id;
      submittedId = deploymentId;
    }
    const deadline = now() + budget;
    async function wait(check) {
      while (now() < deadline) {
        await current();
        if (await check()) return;
        await sleep(interval);
      }
      throw new Error('Preview readiness timed out');
    }
    await wait(async () => {
      record = data(await ship('get_deployments_by_id', { id: deploymentId }));
      assert(record?.id === deploymentId && record.projectId === project.id && record.commitSha === sha && record.environment === 'preview',
        'OpenShip release identity mismatch');
      assert([...inFlight, 'reconciling', 'ready'].includes(record.status), 'OpenShip deployment failed or requires action');
      if (record.status !== 'ready') return false;
      const recipe = record.meta;
      assert(recipe?.organizationId === ORG && recipe.runtimeMode === 'docker' && recipe.build === 'dockerfile'
        && recipe.source === 'git' && recipe.workload === 'web' && recipe.port === 3000
        && JSON.stringify(recipe.volumes) === JSON.stringify(['data:/data']), 'Preview release recipe changed');
      const live = validateProject(data(await ship('get_projects_by_id', { id: project.id })), template, number);
      assert(live.activeDeploymentId === deploymentId && live.gitBranch === branch, 'Active preview release mismatch');
      const info = data(await ship('get_deployments_by_id_info', { id: deploymentId }));
      return info?.status === 'running';
    });
    const dnsPath = `/zones/${ZONE}/dns_records`;
    const dns = await cf('GET', `${dnsPath}?name=${origin}`);
    assert(Array.isArray(dns) && dns.length <= 1, 'Origin DNS conflict');
    if (dns.length) assert(dns[0].name === origin && dns[0].type === 'A' && dns[0].content === '65.21.149.236' && dns[0].proxied === true, 'Origin DNS changed');
    else await cf('POST', dnsPath, { type: 'A', name: origin, content: '65.21.149.236', proxied: true, ttl: 1 });
    const originRows = data(await ship('get_domains', { query: { projectId: project.id } }));
    assert(Array.isArray(originRows) && originRows.every(row => row.hostname === origin && row.projectId === project.id), 'Unexpected preview origin domain');
    assert(originRows.length <= 1, 'Duplicate preview origin');
    let originDomain = originRows[0];
    if (!originDomain) originDomain = data(await ship('post_domains', { body: {
      projectId: project.id, hostname: origin, externalIngress: false, sslChallenge: 'http-01', includeWww: false, isPrimary: true,
    } }));
    assert(originDomain?.projectId === project.id && originDomain.hostname === origin && ID.test(originDomain.id)
      && originDomain.externalIngress === false, 'Origin domain identity mismatch');
    await ship('post_domains_by_id_verify', { id: originDomain.id });
    const routing = await ship('post_projects_by_id_routing_retry', { id: project.id });
    assert(routing?.ok === true, 'Preview origin routing refresh failed');
    await wait(async () => {
      const tls = data(await ship('get_domains_by_id', { id: originDomain.id }));
      assert(tls?.projectId === project.id && tls.hostname === origin && tls.externalIngress === false, 'Origin TLS identity mismatch');
      if (tls.verified !== true || tls.sslStatus !== 'active' || !(Date.parse(tls.sslExpiresAt) > now())) return false;
      const ssl = data(await ship('post_domains_by_id_verify_ssl', { id: originDomain.id }));
      assert(ssl?.domain === origin, 'Origin certificate verification identity mismatch');
      return ssl.verified === true && ssl.sslStatus === 'active' && Date.parse(ssl.expiresAt) > now()
        && await probe(`https://${origin}/en/about`);
    });
    await current();
    if (!await customDomain()) await cf('PUT', domainsPath, { hostname, service: WORKER, environment: 'production', zone_id: ZONE });
    assert(await customDomain(), 'Preview hostname write unverified');
    await active(true);
    await wait(() => probe(`https://${hostname}/en/about`, true));
    await current();
    await gh('POST', statusPath, { state: 'success', environment_url: `https://${hostname}`, description: 'Preview ready', auto_inactive: true });
    return { state: 'ready', url: `https://${hostname}`, sha, projectId: project.id };
  } catch (error) {
    try {
      await gh('POST', statusPath, { state: 'error', description: 'Preview setup failed; inspect trusted workflow checks' });
    } finally {
      if (submittedId) {
        const record = data(await ship('get_deployments_by_id', { id: submittedId }));
        assert(record?.projectId === project.id, 'Preview cancellation identity mismatch');
        if (inFlight.has(record.status)) await cancel(submittedId);
      }
      if (pr.state === 'closed') await close();
    }
    throw error;
  }
}

export function clients(env, fetcher = fetch) {
  for (const name of ['GITHUB_TOKEN', 'OPENSHIP_TOKEN', 'CLOUDFLARE_API_TOKEN']) assert(env[name], `${name} missing`);
  async function request(url, token, method = 'GET', body, timeout = 15_000) {
    const response = await fetcher(url, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
      ...(body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      redirect: 'error', signal: AbortSignal.timeout(timeout) });
    assert(response.ok, `Provider request failed (${response.status})`);
    const raw = await response.text();
    assert(raw.length < 2 * 1024 * 1024, 'Provider response too large');
    try { return JSON.parse(raw); } catch { throw new Error('Provider response invalid'); }
  }
  return {
    gh: (method, path, body) => request(`https://api.github.com${path}`, env.GITHUB_TOKEN, method, body),
    async ship(name, args) {
      const result = await request('https://openship.mstefan.dev/api/mcp', env.OPENSHIP_TOKEN, 'POST', {
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { ...args, organizationId: ORG } },
      }, name === 'post_domains_by_id_verify' ? 120_000 : 15_000);
      assert(!result.error && !result.result?.isError, 'OpenShip MCP call failed');
      try { return JSON.parse(result.result.content[0].text); } catch { throw new Error('OpenShip MCP response invalid'); }
    },
    async cf(method, path, body) {
      if (method === 'PATCH' && path.endsWith('/settings')) {
        const form = new FormData();
        form.set('settings', JSON.stringify(body));
        body = form;
      }
      const result = await request(`https://api.cloudflare.com/client/v4${path}`, env.CLOUDFLARE_API_TOKEN, method, body);
      assert(result.success === true, 'Cloudflare call failed');
      return result.result;
    },
    async probe(url, publicPreview = false) {
      try {
        const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { 'Cache-Control': 'no-cache' } });
        await response.body?.cancel();
        return response.status === 200 && (!publicPreview || response.headers.get('X-Robots-Tag') === 'noindex');
      } catch { return false; }
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    assert(process.env.GITHUB_REPOSITORY === REPO && process.env.GITHUB_EVENT_NAME === 'pull_request_target', 'Trusted workflow event required');
    const result = await runPreview({ number: event.number, templateId: process.env.OPENSHIP_PREVIEW_TEMPLATE_ID,
      seed: process.env.PREVIEW_PAYLOAD_SECRET, ...clients(process.env) });
    console.log(`PR preview: ${result.state}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
