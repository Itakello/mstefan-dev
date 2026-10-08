import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';

const verificationToken = 'notion-publication-fixture-signing-token';
const projectsId = '24c05536-223f-8010-8423-000b87dc6df2';
const stackId = '658f4e30-0002-40e4-9e75-506129258507';
const fetchCache = path.resolve('.next/cache/fetch-cache');
let port = 0;
let base = '';
let dataDir = '';
let fixtureState = '';
let iconFixtureState = '';
let server: ChildProcess | undefined;
let serverLog = '';
let environment: NodeJS.ProcessEnv;
let originalCache = new Map<string, { body: Buffer; mode: number; atime: Date; mtime: Date }>();
let snapshotCacheFile: string | undefined;

async function filesUnder(directory: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const nested = await Promise.all(entries.map((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(filename) : entry.isFile() ? [filename] : [];
  }));
  return nested.flat();
}

async function preserveCache() {
  originalCache = new Map();
  for (const filename of await filesUnder(fetchCache)) {
    const [body, details] = await Promise.all([readFile(filename), stat(filename)]);
    originalCache.set(filename, {
      body,
      mode: details.mode & 0o777,
      atime: details.atime,
      mtime: details.mtime,
    });
  }
}

async function restoreCache() {
  const currentFiles = await filesUnder(fetchCache);
  for (const filename of currentFiles) {
    const original = originalCache.get(filename);
    if (!original) await rm(filename, { force: true });
    else {
      await writeFile(filename, original.body);
      await chmod(filename, original.mode);
      await utimes(filename, original.atime, original.mtime);
    }
  }
  for (const [filename, original] of originalCache) {
    if (currentFiles.includes(filename)) continue;
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, original.body);
    await chmod(filename, original.mode);
    await utimes(filename, original.atime, original.mtime);
  }
  const directories = currentFiles.map((filename) => path.dirname(filename));
  const createdDirectories = new Set<string>();
  for (const directory of directories) {
    let current = directory;
    while (current.startsWith(fetchCache) && current !== fetchCache) {
      if (![...originalCache.keys()].some((filename) => filename.startsWith(`${current}${path.sep}`))) createdDirectories.add(current);
      current = path.dirname(current);
    }
  }
  for (const directory of [...createdDirectories].sort((left, right) => right.length - left.length)) {
    try { if ((await readdir(directory)).length === 0) await rm(directory, { recursive: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

async function unusedLoopbackPort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const address = probe.address();
  assert.ok(address && typeof address !== 'string');
  const available = address.port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return available;
}

async function request(url: string, init?: RequestInit) {
  return fetch(`${base}${url}`, { signal: AbortSignal.timeout(10_000), ...init });
}

async function setFixtureMode(mode: string) {
  await writeFile(fixtureState, mode, { mode: 0o600 });
}

async function setIconMode(mode: 'ok' | 'error') {
  const state = JSON.parse(await readFile(iconFixtureState, 'utf8'));
  await writeFile(iconFixtureState, JSON.stringify({ ...state, mode }), { mode: 0o600 });
}

async function iconRequestCount() {
  return (JSON.parse(await readFile(iconFixtureState, 'utf8')) as { requests: number }).requests;
}

async function sendPublicationEvent() {
  const body = JSON.stringify({
    type: 'page.properties_updated',
    data: { parent: { data_source_id: projectsId } },
  });
  const signature = `sha256=${createHmac('sha256', verificationToken).update(body).digest('hex')}`;
  const response = await request('/api/webhooks/notion', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-notion-signature': signature },
    body,
  });
  const responseBody = await response.text();
  assert.equal(response.status, 200, responseBody);
  assert.deepEqual(JSON.parse(responseBody), { accepted: true, invalidated: true });
}

async function publicHtml(route: string) {
  const response = await request(route);
  return { response, html: await response.text() };
}

async function start() {
  serverLog = '';
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: environment, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (data) => { serverLog = (serverLog + data.toString()).slice(-8_000); });
  server.stderr?.on('data', (data) => { serverLog = (serverLog + data.toString()).slice(-8_000); });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Production server exited: ${serverLog}`);
    try {
      const response = await request('/en/about');
      if (response.ok) return;
      if (response.status === 500) throw new Error(`Production route failed: ${serverLog}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Production route failed:')) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Production startup timed out: ${serverLog}`);
}

async function stop() {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    const forceStop = setTimeout(() => server?.kill('SIGKILL'), 5_000);
    server.kill('SIGTERM');
    await exited;
    clearTimeout(forceStop);
  }
  server = undefined;
}

async function readObservation() {
  return JSON.parse(await readFile(path.join(dataDir, 'publication-health', 'state.json'), 'utf8')) as {
    success: number; failure: number; event: number; pending: number; digest: string; projects: number; stack: number;
  };
}

async function findSnapshotCacheFile(digest: string) {
  for (const filename of await filesUnder(fetchCache)) {
    const text = await readFile(filename, 'utf8');
    if (!text.includes(digest)) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { continue; }
    if (!parsed || typeof parsed !== 'object') continue;
    return { filename, mtime: (await stat(filename)).mtime };
  }
  throw new Error('Could not find the native Next fetch-cache entry for the Notion snapshot');
}

before(async () => {
  await preserveCache();
  port = await unusedLoopbackPort();
  base = `http://127.0.0.1:${port}`;
  dataDir = await mkdtemp(path.join(tmpdir(), 'payload-publication-test-'));
  fixtureState = path.join(dataDir, 'notion-fixture-state');
  iconFixtureState = path.join(dataDir, 'icon-fixture-state');
  await setFixtureMode('publication');
  await writeFile(iconFixtureState, JSON.stringify({ mode: 'ok', requests: 0 }), { mode: 0o600 });
  const fixture = path.resolve('tests/cms/notion-publication-fixture.mjs');
  environment = {
    ...process.env,
    NODE_ENV: 'production',
    PAYLOAD_DATA_DIR: dataDir,
    PAYLOAD_SECRET: 'publication-fixture-secret-only-000000000000000000000000',
    NEXT_TELEMETRY_DISABLED: '1',
    SITE_DEPLOYMENT: 'public',
    VERCEL: '',
    VERCEL_ENV: '',
    NOTION_TOKEN: 'visual-review-fixture',
    NOTION_DATABASE_ID: 'visual-review-fixture',
    NOTION_STACK_DATABASE_ID: 'visual-stack-fixture',
    NOTION_PROJECTS_DATA_SOURCE_ID: projectsId,
    NOTION_STACK_DATA_SOURCE_ID: stackId,
    NOTION_WEBHOOK_VERIFICATION_TOKEN: verificationToken,
    GITHUB_TOKEN: '',
    VISUAL_NOTION_FIXTURE_STATE: fixtureState,
    VISUAL_ICON_FIXTURE_STATE: iconFixtureState,
    NODE_OPTIONS: `--import=${fixture}`,
  };
  const migration = spawnSync(process.execPath, ['node_modules/payload/bin.js', 'migrate'], { env: environment, encoding: 'utf8' });
  assert.equal(migration.status, 0, migration.stderr);
  await start();
}, { timeout: 90_000 });

after(async () => {
  await stop();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
  await restoreCache();
});

test('production Notion changes, withdrawals, hard failures, and stale-cache recovery', { timeout: 180_000 }, async () => {
  await sendPublicationEvent();
  let home = await publicHtml('/en');
  let projects = await publicHtml('/en/projects');
  assert.equal(home.response.status, 200);
  assert.equal(projects.response.status, 200);
  assert.ok(home.html.includes('Personal website fixture.'));
  assert.ok(projects.html.includes('Personal website fixture.'));
  snapshotCacheFile = (await findSnapshotCacheFile((await readObservation()).digest)).filename;

  await setFixtureMode('error');
  await sendPublicationEvent();
  const failedRefresh = await publicHtml('/en/projects');
  assert.equal(failedRefresh.response.status, 500, 'Hard invalidation should fail closed when Notion cannot refresh');
  let observation = await readObservation();
  assert.ok(observation.failure >= observation.success);

  await setFixtureMode('changedsummary');
  await sendPublicationEvent();
  home = await publicHtml('/en');
  projects = await publicHtml('/en/projects');
  assert.equal(home.response.status, 200);
  assert.equal(projects.response.status, 200);
  assert.ok(home.html.includes('Changed publication fixture.'));
  assert.ok(projects.html.includes('Changed publication fixture.'));
  observation = await readObservation();
  const lastGoodDigest = observation.digest;
  assert.match(lastGoodDigest, /^[a-f0-9]{64}$/);
  assert.equal(observation.failure <= observation.success, true);

  await setFixtureMode('empty');
  await sendPublicationEvent();
  projects = await publicHtml('/en/projects');
  assert.equal(projects.response.status, 200);
  assert.ok(!projects.html.includes('mstefan-dev'));
  observation = await readObservation();
  assert.equal(observation.projects, 0, 'An approved withdrawal should replace the complete snapshot');

  await setFixtureMode('changedsummary');
  await sendPublicationEvent();
  projects = await publicHtml('/en/projects');
  assert.ok(projects.html.includes('Changed publication fixture.'));
  observation = await readObservation();
  const expiryDigest = observation.digest;
  const cached = await findSnapshotCacheFile(expiryDigest);
  const expiredMtime = new Date(Date.now() - 86_401_000);
  await utimes(cached.filename, expiredMtime, expiredMtime);

  await stop();
  await setFixtureMode('error');
  await start();
  projects = await publicHtml('/en/projects');
  assert.equal(projects.response.status, 200, 'Time-based refresh failure should serve the last successful cached snapshot');
  assert.ok(projects.html.includes('Changed publication fixture.'));
  const failureDeadline = Date.now() + 10_000;
  do {
    observation = await readObservation();
    if (observation.failure > observation.success) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < failureDeadline);
  assert.ok(observation.failure > observation.success, 'Failed expiry refresh must be observable');
  assert.equal(observation.digest, expiryDigest, 'Failed refresh must preserve the previous successful digest');
  assert.equal((await stat(cached.filename)).mtime.getTime(), expiredMtime.getTime());

  await stop();
  await setFixtureMode('recovered');
  await start();
  const recoveryDeadline = Date.now() + 15_000;
  do {
    projects = await publicHtml('/en/projects');
    if (projects.response.ok && projects.html.includes('Recovered publication fixture.')) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  } while (Date.now() < recoveryDeadline);
  assert.equal(projects.response.status, 200);
  assert.ok(projects.html.includes('Recovered publication fixture.'), 'Expired snapshot should refresh after recovery and restart');
  observation = await readObservation();
  assert.ok(observation.success > 0);
  assert.equal(observation.failure <= observation.success, true);
  assert.notEqual(observation.digest, expiryDigest);
  assert.ok(observation.event <= observation.success, 'Successful refresh should clear the pending event age');
  assert.ok((await stat(cached.filename)).mtime.getTime() > expiredMtime.getTime());

  const validatedIconRequests = await iconRequestCount();
  assert.ok(validatedIconRequests > 0);
  await setIconMode('error');
  await stop();
  await start();
  [home, projects] = await Promise.all([publicHtml('/en'), publicHtml('/en/projects')]);
  assert.equal(home.response.status, 200);
  assert.equal(projects.response.status, 200);
  assert.ok(home.html.includes('Recovered publication fixture.'));
  assert.ok(projects.html.includes('Recovered publication fixture.'));
  assert.equal(await iconRequestCount(), validatedIconRequests, 'Persisted publication snapshot must render without revalidating icons during provider outage');
  assert.equal((await readObservation()).digest, observation.digest);

  await sendPublicationEvent();
  projects = await publicHtml('/en/projects');
  assert.equal(projects.response.status, 500, 'An icon error with a cloned response body must fail promptly');
  assert.ok((await readObservation()).failure > observation.success);
  await setIconMode('ok');
  await sendPublicationEvent();
  projects = await publicHtml('/en/projects');
  assert.equal(projects.response.status, 200);
  assert.ok(projects.html.includes('Recovered publication fixture.'));
  assert.equal((await readObservation()).pending, 0);
});
