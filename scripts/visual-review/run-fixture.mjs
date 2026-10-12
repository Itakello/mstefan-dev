import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const { values } = parseArgs({ options: {
  smoke: { type: 'boolean' }, 'reuse-build': { type: 'boolean' },
  'update-snapshots': { type: 'boolean' }, explore: { type: 'boolean' },
  'base-ref': { type: 'string' },
  desktop: { type: 'boolean' }, 'output-dir': { type: 'string' },
} });
const smokeOnly = values.smoke;
const reuseBuild = values['reuse-build'];
const updateSnapshots = values['update-snapshots'];
const explore = values.explore || values.desktop;
const nativeFavicon = process.env.VISUAL_REVIEW_NATIVE_FAVICON === 'true';
if ((updateSnapshots && smokeOnly) || (explore && (smokeOnly || updateSnapshots || nativeFavicon)) || Boolean(values['base-ref']) !== Boolean(explore)) {
  throw new Error('Use --explore --base-ref REF separately from smoke, snapshot updates and native favicon review.');
}
if (values['output-dir'] && !explore) throw new Error('--output-dir requires exploration.');
if (explore && ['.env', '.env.local', '.env.production', '.env.production.local'].some(existsSync)) throw new Error('Exploration requires a checkout without provider env files.');
const dataDir = await mkdtemp(path.join(tmpdir(), 'payload-visual-review-'));
const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const environment = {
  ...(explore ? Object.fromEntries(['PATH', 'HOME', 'CODEX_HOME', 'TMPDIR', 'LANG', 'PLAYWRIGHT_BROWSERS_PATH', 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'].filter(key => process.env[key]).map(key => [key, process.env[key]])) : process.env), NODE_ENV: 'production', PAYLOAD_DATA_DIR: dataDir,
  VISUAL_NOTION_FIXTURE_STATE: path.join(dataDir, 'notion-state'),
  PAYLOAD_SECRET: randomBytes(32).toString('hex'), NEXT_TELEMETRY_DISABLED: '1',
  NOTION_TOKEN: 'visual-review-fixture', NOTION_DATABASE_ID: 'visual-review-fixture', NOTION_STACK_DATABASE_ID: 'visual-stack-fixture', GITHUB_TOKEN: '', POSTHOG_PROJECT_TOKEN: '',
  VERCEL: '', VERCEL_ENV: '', VERCEL_GITHUB_OIDC_TOKEN: '', SITE_DEPLOYMENT: 'private',
  NODE_OPTIONS: `--import=${path.resolve('tests/cms/notion-publication-fixture.mjs')}`,
  VISUAL_REVIEW_HEAD_SHA: headSha,
};
let server;
let serverLog = '';
let activeCommand;
let interrupted = false;
let finishHold;
let forceStop;
function interrupt() {
  interrupted = true;
  activeCommand?.kill('SIGTERM');
  server?.kill('SIGTERM');
  finishHold?.();
  clearTimeout(forceStop);
  forceStop = setTimeout(() => { activeCommand?.kill('SIGKILL'); server?.kill('SIGKILL'); }, 5000);
}
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);
async function run(args, timeout = 600_000) {
  if (interrupted) throw new Error('Fixture interrupted.');
  const child = spawn(process.execPath, args, { env: environment, stdio: 'inherit', timeout });
  activeCommand = child;
  const [code, signal] = await once(child, 'exit');
  activeCommand = undefined;
  if (interrupted) throw new Error('Fixture interrupted.');
  if (code !== 0) throw new Error(`${args[0]} failed (${signal ?? code}).`);
}
try {
  await writeFile(environment.VISUAL_NOTION_FIXTURE_STATE, 'multiple');
  // Payload's onInit seeds the checked-in bilingual copy after migrations.
  await run(['node_modules/payload/bin.js', 'migrate']);
  await run(['node_modules/payload/bin.js', 'generate:types']);
  if (!reuseBuild) await run(['node_modules/next/dist/bin/next', 'build', '--webpack']);
  if ((nativeFavicon || explore) && !reuseBuild) {
    if (nativeFavicon && headSha !== process.env.VISUAL_REVIEW_HEAD_SHA) throw new Error('Native favicon source head differs from the requested review');
    await writeFile('.next/visual-review-build.json', JSON.stringify({ headSha, buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim() }));
  }
  if (explore && reuseBuild) {
    const build = JSON.parse(await readFile('.next/visual-review-build.json', 'utf8'));
    if (build.headSha !== headSha || build.buildId !== (await readFile('.next/BUILD_ID', 'utf8')).trim()) throw new Error('Exploration requires an exact-head fixture build.');
  }
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  environment.PLAYWRIGHT_BASE_URL = base;
  environment.CMS_TEST_PORT = String(port);
  if (!smokeOnly && !explore) {
    await rm('.artifacts/playwright/master-download', { recursive: true, force: true });
    await run(['--import', 'tsx', '--test', '--test-name-pattern=degree results are optional metadata downloads', 'tests/cms/lifecycle.test.mts']);
  }
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
    if (interrupted) throw new Error('Fixture interrupted.');
    if (server.exitCode !== null || server.signalCode !== null) throw new Error(`Production fixture exited: ${serverLog}`);
    let response;
    try { response = await fetch(`${base}/en/about`, { signal: AbortSignal.timeout(5000) }); } catch {}
    if (response?.ok) { ready = true; break; }
    if (response?.status === 500) throw new Error(`Production fixture failed: ${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error(`Production fixture startup timed out: ${serverLog}`);
  if (explore) {
    const output = path.resolve(values['output-dir'] || '.artifacts/exploring-ui-review');
    await run([fileURLToPath(new URL('./explore.mjs', import.meta.url)), '--base-ref', values['base-ref'], '--output-dir', output, ...(values.desktop ? ['--prepare-only'] : [])], 660_000);
    if (values.desktop) {
      await writeFile(path.join(output, 'fixture.json'), JSON.stringify({ pid: process.pid, origin: base, head: headSha, state: environment.VISUAL_NOTION_FIXTURE_STATE, expiresAt: new Date(Date.now() + 600_000).toISOString() }, null, 2));
      console.log(`Desktop fixture ready: ${output}. Stop with SIGINT after the attended review.`);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Desktop fixture review window expired.')), 600_000);
        finishHold = () => { clearTimeout(timer); resolve(); };
        if (interrupted) finishHold();
      });
    }
  } else {
    await run(['node_modules/@playwright/test/cli.js', 'test', ...(smokeOnly ? ['--project=smoke'] : ['--project=review', '--project=consistency']), ...(updateSnapshots ? ['--update-snapshots'] : [])], 300_000);
    if (!smokeOnly) await cp('.artifacts/playwright/master-download', '.artifacts/playwright/test-results/degree-results', { recursive: true });
  }
  if (nativeFavicon) await run(['--import', 'tsx', 'scripts/visual-review/native-favicon.mjs'], 90_000);
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    const forceStop = setTimeout(() => server.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(forceStop);
  }
  await mkdir('.artifacts/playwright', { recursive: true });
  await writeFile('.artifacts/playwright/fixture-server.log', serverLog);
  await rm(dataDir, { recursive: true, force: true });
  clearTimeout(forceStop);
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
