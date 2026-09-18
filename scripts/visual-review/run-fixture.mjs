import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'payload-visual-review-'));
const environment = {
  ...process.env, NODE_ENV: 'production', PAYLOAD_DATA_DIR: dataDir,
  PAYLOAD_SECRET: randomBytes(32).toString('hex'), NEXT_TELEMETRY_DISABLED: '1',
  NOTION_TOKEN: '', NOTION_DATABASE_ID: '', NOTION_STACK_DATABASE_ID: '', GITHUB_TOKEN: '',
  VERCEL: '', VERCEL_ENV: '', VERCEL_GITHUB_OIDC_TOKEN: '', SITE_DEPLOYMENT: 'private',
  NODE_OPTIONS: `--import=${path.resolve('tests/cms/offline-fetch.mjs')}`,
};
let server;
let serverLog = '';
async function run(args, timeout = 600_000) {
  const child = spawn(process.execPath, args, { env: environment, stdio: 'inherit', timeout });
  const [code, signal] = await once(child, 'exit');
  if (code !== 0) throw new Error(`${args[0]} failed (${signal ?? code}).`);
}
try {
  // Payload's onInit seeds the checked-in bilingual copy after migrations.
  await run(['node_modules/payload/bin.js', 'migrate']);
  await run(['node_modules/next/dist/bin/next', 'build', '--webpack']);
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  environment.PLAYWRIGHT_BASE_URL = base;
  if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `PLAYWRIGHT_BASE_URL=${base}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `## Exact-head production fixture\n\nHead SHA: ${process.env.VISUAL_REVIEW_HEAD_SHA}\n\nDisposable SQLite, seeded bilingual copy, private fixture mode, offline integrations; live public integrations are not validated.\n`);
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: environment, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (data) => { serverLog = (serverLog + data).slice(-100_000); });
  server.stderr.on('data', (data) => { serverLog = (serverLog + data).slice(-100_000); });
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Production fixture exited: ${serverLog}`);
    let response;
    try { response = await fetch(`${base}/en/about`, { signal: AbortSignal.timeout(5000) }); } catch {}
    if (response?.ok) { ready = true; break; }
    if (response?.status === 500) throw new Error(`Production fixture failed: ${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error(`Production fixture startup timed out: ${serverLog}`);
  await run(['node_modules/@playwright/test/cli.js', 'test', '--project=review'], 180_000);
} finally {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    const forceStop = setTimeout(() => server.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(forceStop);
  }
  await mkdir('.artifacts/playwright', { recursive: true });
  await writeFile('.artifacts/playwright/fixture-server.log', serverLog);
  await rm(dataDir, { recursive: true, force: true });
}
