import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { chromium, expect } from '@playwright/test';

const base = 'http://127.0.0.1:3000';
const password = randomBytes(24).toString('base64url');
const email = 'cms-integration@example.invalid';
let dataDir: string;
let server: ChildProcess | undefined;
let serverLog = '';
let cookie = '';
let environment: NodeJS.ProcessEnv;

function publicRequest(url: string, headers: Record<string, string>) {
  // Raw HTTP preserves the Host override; newer fetch implementations discard it.
  return new Promise<Response>((resolve, reject) => {
    const req = httpRequest(new URL(url, base), { headers, timeout: 5000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode })));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Public request timed out')));
    req.end();
  });
}

async function request(url: string, data?: unknown, authenticated = false) {
  return fetch(`${base}${url}`, {
    signal: AbortSignal.timeout(5000),
    method: data === undefined ? 'GET' : 'POST',
    headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(authenticated ? { Cookie: cookie } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function update(slug: string, locale: string, data: unknown, query = '') {
  const response = await request(`/api/globals/${slug}?locale=${locale}${query}`, data, true);
  assert.equal(response.status, 200, `Update failed for ${slug}/${locale}`);
  return response.json();
}
async function publicTitle(locale: string, title: string, absent?: string) {
  const response = await request(`/${locale}/about`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes(title), `Missing published title ${title}`);
  if (absent) assert.ok(!html.includes(absent), 'A draft appeared in public HTML');
}
async function stop() {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    const forceStop = setTimeout(() => server?.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(forceStop);
  }
  server = undefined;
}
async function start() {
  serverLog = '';
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3000'], {
    env: environment, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (data) => { serverLog = (serverLog + data.toString()).slice(-8000); });
  server.stderr?.on('data', (data) => { serverLog = (serverLog + data.toString()).slice(-8000); });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Production server exited: ${serverLog}`);
    let response: Response | undefined;
    try { response = await request('/en/about'); } catch {}
    if (response?.ok) return;
    if (response?.status === 500) throw new Error(`Production route failed: ${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Production startup timed out: ${serverLog}`);
}

before(async () => {
  const probe = createServer();
  probe.listen(3000, '127.0.0.1');
  await once(probe, 'listening');
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  dataDir = await mkdtemp(path.join(tmpdir(), 'payload-http-test-'));
  environment = {
    ...process.env, NODE_ENV: 'production', PAYLOAD_DATA_DIR: dataDir,
    PAYLOAD_SECRET: randomBytes(32).toString('hex'), NEXT_TELEMETRY_DISABLED: '1',
    NOTION_TOKEN: '', NOTION_DATABASE_ID: '', NOTION_STACK_DATABASE_ID: '', GITHUB_TOKEN: '', VERCEL: '', VERCEL_ENV: '', SITE_DEPLOYMENT: 'private',
    NODE_OPTIONS: `--import=${path.resolve('tests/cms/offline-fetch.mjs')}`,
  };
  const migration = spawnSync(process.execPath, ['node_modules/payload/bin.js', 'migrate'], { env: environment, encoding: 'utf8' });
  assert.equal(migration.status, 0, migration.stderr);
  await start();
  const registered = await request('/api/users/first-register', { email, password });
  assert.equal(registered.status, 200);
  cookie = registered.headers.get('set-cookie')!.split(';')[0];
}, { timeout: 90_000 });
after(async () => { await stop(); if (dataDir) await rm(dataDir, { recursive: true, force: true }); });

test('production drafts, active-locale UI publishing, media privacy, and restart persistence', { timeout: 120_000 }, async () => {
  for (const locale of ['en', 'it']) {
    await update('about', locale, { title: `${locale}-published`, _status: 'published' }, `&publishSpecificLocale=${locale}`);
  }
  await update('about', 'it', { title: 'it-private-draft' }, '&draft=true');
  await update('about', 'en', { title: 'en-private-draft' }, '&draft=true');
  await publicTitle('en', 'en-published', 'en-private-draft');
  await publicTitle('it', 'it-published', 'it-private-draft');
  for (const url of ['/en/about?preview=1', '/it/about?preview=1', '/en?preview=1', '/api/globals/about?draft=true', '/api/globals/about/versions', '/api/users']) {
    const response = await request(url);
    assert.ok([401, 403, 404].includes(response.status), `Anonymous access succeeded: ${url} (${response.status})`);
  }
  const preview = await request('/en/about?preview=1', undefined, true);
  assert.equal(preview.status, 200);
  assert.ok((await preview.text()).includes('en-private-draft'));
  const publicHeaders = { Host: 'mstefan.dev', Cookie: cookie, 'X-Forwarded-Host': 'localhost:3000' };
  for (const url of ['/admin', '/admin/login', '/admin/login.json', '/%61dmin', '/api/users', '/api/users/first-register', '/api/globals/about?draft=true', '/api/graphql', '/en/about?preview=1']) {
    const result = await publicRequest(url, publicHeaders);
    assert.equal(result.status, 404, `Public CMS boundary failed: ${url}`);
  }
  const publicPage = await publicRequest('/en/about', publicHeaders);
  assert.equal(publicPage.status, 200);
  assert.ok(!(await publicPage.text()).includes('en-private-draft'));
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies([{ name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), url: base }]);
    const page = await context.newPage();
    await page.goto(`${base}/admin/globals/about?locale=en`);
    await expect(page.locator('#field-title')).toHaveValue('en-private-draft');
    await page.locator('#field-title').fill('en-published-from-ui');
    const published = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/api/globals/about') && response.url().includes('publishSpecificLocale=en'));
    await page.getByRole('button', { name: /publish/i }).first().click();
    assert.equal((await published).status(), 200);
    await publicTitle('en', 'en-published-from-ui', 'en-private-draft');
    await publicTitle('it', 'it-published', 'it-private-draft');
    const draft = await request('/api/globals/about?locale=it&draft=true', undefined, true);
    assert.equal((await draft.json()).title, 'it-private-draft');
    await context.close();
  } finally { await browser.close(); }

  const form = new FormData();
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ks8AAAAASUVORK5CYII=', 'base64');
  form.set('file', new Blob([bytes], { type: 'image/png' }), 'private-draft.png');
  form.set('_payload', '{}');
  const upload = await fetch(`${base}/api/media`, { method: 'POST', headers: { Cookie: cookie }, body: form });
  assert.equal(upload.status, 201);
  const media = (await upload.json()).doc;
  await update('about', 'en', { photo: media.id }, '&draft=true');
  for (const url of [`/api/media/${media.id}`, media.url]) {
    const result = await fetch(new URL(url, base));
    assert.ok([401, 403, 404].includes(result.status), `Draft image exposed through ${url}`);
  }
  const authenticatedFile = await fetch(new URL(media.url, base), { headers: { Cookie: cookie } });
  assert.equal(authenticatedFile.status, 200);
  const publicHostDraftFile = await publicRequest(media.url, publicHeaders);
  assert.ok([401, 403, 404].includes(publicHostDraftFile.status), 'Public media accepted private CMS authentication');
  await update('about', 'en', { photo: media.id, _status: 'published' }, '&publishSpecificLocale=en');
  const publicFile = await fetch(new URL(media.url, base));
  assert.equal(publicFile.status, 200);
  assert.deepEqual(Buffer.from(await publicFile.arrayBuffer()), bytes);
  const publicHostFile = await publicRequest(media.url, publicHeaders);
  assert.equal(publicHostFile.status, 200);
  assert.deepEqual(Buffer.from(await publicHostFile.arrayBuffer()), bytes);
  const optimizedURL = `${base}/_next/image?url=${encodeURIComponent(media.url)}&w=640&q=75`;
  assert.equal((await publicRequest(optimizedURL, publicHeaders)).status, 404, 'CMS media must not enter the image optimizer cache');
  await stop();
  await start();
  await publicTitle('en', 'en-published-from-ui');
  await publicTitle('it', 'it-published', 'it-private-draft');
  const login = await request('/api/users/login', { email, password });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie')!.split(';')[0];
  const persistedDraft = await request('/api/globals/about?locale=it&draft=true', undefined, true);
  assert.equal((await persistedDraft.json()).title, 'it-private-draft');
  const persistedFile = await fetch(new URL(media.url, base));
  assert.deepEqual(Buffer.from(await persistedFile.arrayBuffer()), bytes);
  await update('about', 'en', { photo: null, _status: 'published' }, '&publishSpecificLocale=en');
  const removedFile = await fetch(new URL(media.url, base));
  assert.ok([401, 403, 404].includes(removedFile.status), 'Removed published image remained public');
  assert.equal((await publicRequest(optimizedURL, publicHeaders)).status, 404);
  const privateFile = await fetch(new URL(media.url, base), { headers: { Cookie: cookie } });
  assert.equal(privateFile.status, 200);
  const secondRegistration = await request('/api/users/first-register', { email: 'another@example.invalid', password });
  assert.notEqual(secondRegistration.status, 200);
});
