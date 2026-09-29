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
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), {
        status: res.statusCode, headers: { 'cache-control': res.headers['cache-control'] ?? '' },
      })));
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
  for (const url of ['/en/about?preview=1', '/it/about?preview=1', '/en?preview=1', '/api/globals/about?draft=true', '/api/globals/about/versions', '/api/globals/career?draft=true', '/api/globals/career/versions', '/api/users']) {
    const response = await request(url);
    assert.ok([401, 403, 404].includes(response.status), `Anonymous access succeeded: ${url} (${response.status})`);
  }
  const preview = await request('/en/about?preview=1', undefined, true);
  assert.equal(preview.status, 200);
  assert.ok((await preview.text()).includes('en-private-draft'));
  const publicHeaders = { Host: 'mstefan.dev', Cookie: cookie, 'X-Forwarded-Host': 'localhost:3000' };
  for (const url of ['/admin', '/admin/login', '/admin/login.json', '/%61dmin', '/api/users', '/api/users/first-register', '/api/globals/about?draft=true', '/api/globals/career?draft=true', '/api/graphql', '/en/about?preview=1']) {
    const result = await publicRequest(url, publicHeaders);
    assert.equal(result.status, 404, `Public CMS boundary failed: ${url}`);
  }
  const publicPage = await publicRequest('/en/about', publicHeaders);
  assert.equal(publicPage.status, 200);
  assert.ok(!(await publicPage.text()).includes('en-private-draft'));
  assert.equal((await publicRequest('/admin', { Host: 'localhost:3000', Cookie: cookie, 'X-Real-IP': '127.0.0.1' })).status, 404, 'Proxy requests with spoofed loopback Host must remain public');
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
  assert.equal(publicHostFile.headers.get('cache-control'), 'no-store', 'Public CMS files must not enter browser or CDN caches');
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


test('career admin live preview keeps About text intact and locale drafts private', { timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies([{ name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), url: base }]);
    const page = await context.newPage();
    await page.goto(`${base}/admin/globals/career?locale=en`);
    await expect(page.locator('#field-jobs__0__company')).toHaveValue('Amazon');
    await expect(page.locator('#field-jobs__0__branchName')).toHaveValue('work/amazon');
    await expect(page.locator('#field-jobs__0__role')).toHaveValue('Software Development Engineer I');
    await page.getByRole('button', { name: /live preview/i }).click();
    const iframe = page.locator('iframe');
    await expect(iframe).toHaveAttribute('src', /previewSource=career/);
    const preview = page.frameLocator('iframe');
    await expect(preview.getByRole('heading', { level: 1 })).toHaveText('en-published-from-ui');
    await page.locator('#field-jobs__0__summary').fill('Unsaved career live preview');
    await expect(preview.getByText('Unsaved career live preview', { exact: true })).toBeVisible();
    await expect(preview.getByRole('heading', { level: 1 })).toHaveText('en-published-from-ui');
    const publicPage = await request('/en/about');
    assert.ok(!(await publicPage.text()).includes('Unsaved career live preview'));
    const saveDraft = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/api/globals/career') && response.url().includes('draft=true'));
    await page.getByRole('button', { name: /save draft/i }).click();
    assert.equal((await saveDraft).status(), 200);
    const englishDraft = await request('/api/globals/career?locale=en&draft=true', undefined, true);
    const career = await (await request('/api/globals/career?locale=it&draft=true', undefined, true)).json();
    assert.equal((await englishDraft.json()).jobs[0].summary, 'Unsaved career live preview');
    await update('career', 'it', { jobs: career.jobs.map((job: { company: string; role: string; summary: string }) => ({ ...job, company: 'Amazon', role: 'Software Development Engineer I', summary: 'Sintesi privata italiana' })) }, '&draft=true');
    const publish = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/api/globals/career') && response.url().includes('publishSpecificLocale=en'));
    await page.getByRole('button', { name: /publish/i }).first().click();
    assert.equal((await publish).status(), 200);
    const publishedPage = await request('/en/about');
    assert.ok((await publishedPage.text()).includes('Unsaved career live preview'));
    const italianPage = await request('/it/about');
    const italianHTML = await italianPage.text();
    assert.ok(!italianHTML.includes('Sintesi privata italiana'));
    assert.ok(!italianHTML.includes('Unsaved career live preview'));
    const italianDraft = await request('/api/globals/career?locale=it&draft=true', undefined, true);
    assert.equal((await italianDraft.json()).jobs[0].summary, 'Sintesi privata italiana');
    for (const url of ['/en/about?preview=1&previewSource=career', '/en?preview=1&previewSource=career']) {
      const anonymous = await request(url);
      assert.ok([401, 403, 404].includes(anonymous.status), `Anonymous career preview succeeded: ${url}`);
    }
    await update('career', 'en', { _status: 'published', jobs: [
      { branchName: 'education/test-university', company: 'Test University with a deliberately long organization name', role: 'Qualification with a long title to exercise wrapping on small screens', summary: 'Education fixture details', color: '#1267ab' },
      { branchName: 'work/amazon', company: 'Amazon', role: 'Software Development Engineer I', summary: 'Amazon fixture details', color: '#c77835' },
    ] }, '&publishSpecificLocale=en');
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`${base}/en`);
    const graph = page.getByRole('region', { name: 'Career', exact: true });
    await expect(graph.locator('button[data-career-job]')).toHaveCount(2);
    await expect(graph.getByText('Education fixture details', { exact: true })).toBeVisible();
    await expect(graph.locator('button[data-career-job]').first()).toHaveAttribute('aria-pressed', 'true');
    const amazon = graph.locator('button[data-career-job]', { hasText: 'work/amazon' });
    await amazon.click();
    await expect(amazon).toHaveAttribute('aria-pressed', 'true');
    await expect(graph.getByText('Amazon fixture details', { exact: true })).toBeVisible();
    await expect(graph.getByText('Education fixture details', { exact: true })).toHaveCount(0);
    const branches = graph.locator('svg [data-career-branch]');
    await expect(branches).toHaveCount(2);
    const educationBranch = graph.locator('[data-career-branch][aria-label^="education/test-university:"]');
    const amazonBranch = graph.locator('[data-career-branch][aria-label^="work/amazon:"]');
    await educationBranch.focus();
    await educationBranch.press('Enter');
    await expect(graph.getByText('Education fixture details', { exact: true })).toBeVisible();
    await expect(graph.locator('button[data-career-job]').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(educationBranch).toHaveAttribute('aria-pressed', 'true');
    await amazonBranch.focus();
    await amazonBranch.press('Space');
    await expect(graph.getByText('Amazon fixture details', { exact: true })).toBeVisible();
    await expect(amazon).toHaveAttribute('aria-pressed', 'true');
    await expect(graph.getByText('Dates not provided').first()).toBeVisible();
    await educationBranch.locator('[data-career-head]').click();
    await expect(graph.getByText('Education fixture details', { exact: true })).toBeVisible();
    await expect(graph.locator('button[data-career-job]').first()).toBeFocused();
    await amazonBranch.locator('[data-career-head]').click();
    await expect(graph.getByText('Amazon fixture details', { exact: true })).toBeVisible();
    await expect(amazon).toHaveAttribute('aria-pressed', 'true');
    await expect(amazon).toBeFocused();
    const pathPoint = await educationBranch.locator('path').last().evaluate((element) => {
      const path = element as SVGPathElement;
      const point = path.getPointAtLength(path.getTotalLength() * 0.85);
      const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM()!);
      return { x: screen.x, y: screen.y };
    });
    await page.mouse.click(pathPoint.x, pathPoint.y);
    await expect(graph.getByText('Education fixture details', { exact: true })).toBeVisible();
    await expect(graph.locator('button[data-career-job]').first()).toHaveAttribute('aria-pressed', 'true');

    await update('career', 'en', { _status: 'published', jobs: [
      { branchName: 'education/test-university', company: 'Test University', role: 'Qualification', startDate: '2020-01-01', endDate: '2023-01-01', summary: `Education dated fixture\n${'Long description fixture. '.repeat(120)}`, color: '#1267ab' },
      { branchName: 'work/amazon', company: 'Amazon', role: 'Software Development Engineer I', startDate: '2022-01-01', endDate: '2024-01-01', summary: 'Amazon dated fixture', color: '#c77835' },
      { branchName: 'work/undated-fixture', company: 'Undated fixture', role: 'Test role', summary: 'Undated fixture details', color: '#d568fc' },
    ] }, '&publishSpecificLocale=en');
    await page.reload();
    assert.ok(Number(await educationBranch.locator('[data-career-head]').getAttribute('cy')) > Number(await amazonBranch.locator('[data-career-head]').getAttribute('cy')), 'Later dates must appear above earlier dates despite title order');
    const tree = graph.getByRole('region', { name: 'Graph. Time moves upward.', exact: true });
    assert.ok(await tree.evaluate((element) => element.scrollHeight > element.clientHeight), 'Long history must scroll inside the tree');
    const detail = graph.locator('[aria-live="polite"]');
    await detail.hover();
    await page.mouse.wheel(0, 500);
    await expect.poll(() => detail.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await tree.scrollIntoViewIfNeeded();
    await tree.hover();
    const scrollToPath = await tree.evaluate((element) => element.scrollTop);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => tree.evaluate((element) => element.scrollTop)).toBeGreaterThan(scrollToPath);
    await expect(amazonBranch.locator('[data-career-head]')).not.toBeInViewport();
    const datedPathPosition = () => amazonBranch.locator('path').last().evaluate((element) => {
      const path = element as SVGPathElement;
      const point = path.getPointAtLength(50);
      const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM()!);
      return { x: screen.x, y: screen.y };
    });
    const datedPathPoint = await datedPathPosition();
    assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-career-branch]')?.getAttribute('data-career-branch'), datedPathPoint), await amazonBranch.getAttribute('data-career-branch'), 'The dated path click must hit the visible intended branch');
    await page.mouse.click(datedPathPoint.x, datedPathPoint.y);
    await expect(graph.getByText('Amazon dated fixture', { exact: true })).toBeVisible();
    await expect(amazonBranch.locator('[data-career-head]')).toBeInViewport();
    await expect.poll(() => detail.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(graph.getByRole('heading', { name: 'Amazon', exact: true })).toBeVisible();
    await tree.hover();
    const beforeScroll = await tree.evaluate((element) => element.scrollTop);
    const pageScroll = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => tree.evaluate((element) => element.scrollTop)).toBeGreaterThan(beforeScroll);
    assert.equal(await page.evaluate(() => window.scrollY), pageScroll, 'Tree scrolling must not move the page');
    await expect(amazonBranch.locator('[data-career-head]')).not.toBeInViewport();
    const selectedPathPoint = await datedPathPosition();
    assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-career-branch]')?.getAttribute('data-career-branch'), selectedPathPoint), await amazonBranch.getAttribute('data-career-branch'), 'Reselecting must hit the visible selected branch');
    await page.mouse.click(selectedPathPoint.x, selectedPathPoint.y);
    await expect(amazonBranch.locator('[data-career-head]')).toBeInViewport();
    await expect(graph.locator('button[data-career-job]', { hasText: 'work/amazon' })).toBeFocused();
    await graph.locator('button[data-career-job]', { hasText: 'work/undated-fixture' }).click();
    await expect(graph.getByText('Undated fixture details', { exact: true })).toBeVisible();
    await expect(graph.locator('[data-career-branch][aria-label^="work/undated-fixture:"] [data-career-head]')).toBeInViewport();
    await expect(tree.getByText('Dates not provided', { exact: true })).toBeVisible();

    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Career page overflows at 320px');
    await context.close();
  } finally { await browser.close(); }
});

test('nested career branches share junctions and highlight their labels without connector lines', { timeout: 60_000 }, async () => {
  const fixtures = [
    ['B', 'education/university', 1, 9, null, '#ffaa66'],
    ['C', 'work/independent', 1, 6, null, '#66dd88'],
    ['D', 'education/university/internship', 2, 4, 'education/university', '#ff55cc'],
    ['E', 'work/company', 3, 8, null, '#aa88ff'],
    ['F', 'work/company/project', 5, 8, 'work/company', '#55dddd'],
    ['G', 'work/parallel', 3, 8, null, '#ffbb55'],
    ['H', 'work/next', 6, 10, null, '#55bbff'],
    ['I', 'work/later', 9, 11, null, '#ffaa99'],
  ] as const;
  const jobs = fixtures.map(([company, branchName, start, end, parentBranchName, color]) => ({
    company, branchName, role: 'Synthetic test experience', parentBranchName, color,
    startDate: new Date(Date.UTC(2024, start, 1)).toISOString(), endDate: new Date(Date.UTC(2024, end, 1)).toISOString(),
  }));
  await update('career', 'en', { jobs, laneSpacing: 24, _status: 'published' }, '&publishSpecificLocale=en');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    await page.goto(`${base}/en/about#career`);
    const graph = page.getByRole('region', { name: 'Career', exact: true });
    const project = graph.locator('[data-career-branch][aria-label^="work/company/project:"]');
    const projectLabel = graph.locator('[data-career-label][aria-label^="work/company/project:"]');
    const firstTitle = graph.locator('button[data-career-job]').first();
    await projectLabel.hover();
    await expect(project).toHaveAttribute('data-highlighted', 'true');
    await expect(projectLabel).toHaveAttribute('data-highlighted', 'true');
    await expect(firstTitle).toHaveAttribute('aria-pressed', 'true');
    await projectLabel.click();
    await expect(project).toHaveAttribute('aria-pressed', 'true');
    await expect(graph.locator('button[data-career-job]', { hasText: 'work/company/project' })).toBeFocused();
    await expect(graph.locator('[data-career-label] path, [data-label-anchor]')).toHaveCount(0);
    const labelBounds = await graph.locator('[data-career-label] rect').evaluateAll((rects) => rects.map((rect) => {
      const box = rect.getBoundingClientRect(); return { top: box.top, bottom: box.bottom };
    }));
    for (let i = 1; i < labelBounds.length; i++) assert.ok(labelBounds[i].top >= labelBounds[i - 1].bottom, 'Branch labels overlap');
    const before = await graph.locator('[data-career-head]').evaluateAll((points) => points.map((point) => Number(point.getAttribute('cy'))));
    const beforeWidth = Number(await graph.locator('svg[role="group"]').getAttribute('width'));
    await update('career', 'en', { laneSpacing: 18, _status: 'published' }, '&publishSpecificLocale=en');
    await page.reload();
    await expect.poll(async () => Number(await graph.locator('svg[role="group"]').getAttribute('width'))).toBeLessThan(beforeWidth);
    assert.deepEqual(await graph.locator('[data-career-head]').evaluateAll((points) => points.map((point) => Number(point.getAttribute('cy')))), before);
    const branchB = graph.locator('[data-career-branch][aria-label^="education/university:"]');
    const branchC = graph.locator('[data-career-branch][aria-label^="work/independent:"]');
    await graph.locator('button[data-career-job]', { hasText: 'work/later' }).click();
    await branchB.locator('circle').first().scrollIntoViewIfNeeded();
    const sharedStart = await branchB.locator('circle').first().evaluate((circle) => {
      const box = circle.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-career-branch]')?.getAttribute('data-career-branch'), sharedStart), await branchB.getAttribute('data-career-branch'), 'Closest lane must own the shared junction hit area');
    await page.mouse.move(sharedStart.x, sharedStart.y);
    await expect(branchB).toHaveAttribute('data-highlighted', 'true');
    await expect(branchC).toHaveAttribute('data-highlighted', 'false');
    const junction = await branchB.locator('circle').first().evaluate((dot) => ({ x: dot.getAttribute('cx'), y: dot.getAttribute('cy') }));
    const baseDots = await graph.locator('[data-career-branch] circle[r="4.5"]').evaluateAll((dots, { x, y }) => dots.filter((dot) => dot.getAttribute('cx') === x && dot.getAttribute('cy') === y).map((dot) => dot.getAttribute('fill')), junction);
    assert.equal(baseDots.at(-1), '#ffaa66', 'Closest lane must paint the shared base dot');
    await graph.locator('button[data-career-job]').first().click();
    await branchB.locator('circle').first().click();
    await expect(branchC).toHaveAttribute('aria-pressed', 'true');
    await branchB.locator('circle').first().click();
    await expect(branchB).toHaveAttribute('aria-pressed', 'true');
    await page.setViewportSize({ width: 320, height: 800 });
    await projectLabel.focus();
    await projectLabel.press('Enter');
    await expect(project).toHaveAttribute('aria-pressed', 'true');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Career page overflows at 320px');
  } finally { await browser.close(); }
});

test('authenticated previews load only the active source draft', { timeout: 60_000 }, async () => {
  const slugs = ['home', 'about', 'career'] as const;
  const published = Object.fromEntries(await Promise.all(slugs.map(async (slug) => [slug, await (await request(`/api/globals/${slug}?locale=en&draft=false`, undefined, true)).json()])));
  const originals = Object.fromEntries(await Promise.all(slugs.map(async (slug) => [slug, await (await request(`/api/globals/${slug}?locale=en&draft=true`, undefined, true)).json()])));
  const titles = { home: 'Home source private title', about: 'About source private title' };
  const privateRole = 'Career source private role';
  const privateSummary = 'Career source private summary';
  const browser = await chromium.launch({ headless: true });
  try {
    await update('home', 'en', { title: titles.home }, '&draft=true');
    await update('about', 'en', { title: titles.about }, '&draft=true');
    await update('career', 'en', { jobs: originals.career.jobs.map((job: { role: string; summary?: string | null }) => ({ ...job, role: privateRole, summary: privateSummary })) }, '&draft=true');
    const context = await browser.newContext();
    await context.addCookies([{ name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), url: base }]);
    const page = await context.newPage();
    for (const slug of ['home', 'about'] as const) {
      const pathname = slug === 'home' ? '/en' : '/en/about';
      await page.goto(`${base}${pathname}?preview=1&previewSource=career`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(published[slug].title);
      await expect(page.getByText(titles[slug], { exact: true })).toHaveCount(0);
      const careerPreview = page.getByRole('region', { name: 'Career', exact: true });
      await expect(careerPreview.locator('button[data-career-job]').first()).toContainText(privateRole);
      await expect(careerPreview.getByText(privateSummary, { exact: true })).toBeVisible();
      await page.goto(`${base}${pathname}?preview=1`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(titles[slug]);
      const pagePreviewCareer = page.getByRole('region', { name: 'Career', exact: true });
      await expect(pagePreviewCareer.locator('button[data-career-job]').first()).toContainText(published.career.jobs[0].role);
      await expect(pagePreviewCareer.getByText(privateRole, { exact: true })).toHaveCount(0);
      await expect(pagePreviewCareer.getByText(privateSummary, { exact: true })).toHaveCount(0);
      for (const query of ['?preview=1', '?preview=1&previewSource=career']) {
        const anonymous = await request(`${pathname}${query}`);
        assert.ok([401, 403, 404].includes(anonymous.status), `Anonymous preview succeeded: ${pathname}${query}`);
      }
      await page.goto(`${base}${pathname}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(published[slug].title);
      await expect(page.getByText(privateSummary, { exact: true })).toHaveCount(0);
    }
    await context.close();
  } finally { await browser.close(); }
});
