import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessEvidence, browserTools, fixtureOrigin, reviewEnvironment, previewOrigin, remoteBrowserInit, relayProviderOverrides } from '../scripts/visual-review/explore.mjs';

test('dirty and untracked source is rejected before build; legacy build stamps cannot be reused', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'exploration-provenance-'));
  const runner = fileURLToPath(new URL('../scripts/visual-review/run-fixture.mjs', import.meta.url));
  const run = () => spawnSync(process.execPath, [runner, '--desktop', '--base-ref', 'HEAD', '--reuse-build'], { cwd: root, encoding: 'utf8' });
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    git(['init', '-q']);
    writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.next/\n.artifacts/\n');
    writeFileSync(path.join(root, 'page.js'), 'original');
    mkdirSync(path.join(root, 'tests/cms'), { recursive: true });
    writeFileSync(path.join(root, 'tests/cms/notion-publication-fixture.mjs'), '');
    git(['add', '.']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture']);
    writeFileSync(path.join(root, 'page.js'), 'edited');
    assert.match(run().stderr, /clean tracked files/);
    writeFileSync(path.join(root, 'page.js'), 'original');
    writeFileSync(path.join(root, 'new-page.js'), 'untracked');
    assert.match(run().stderr, /untracked source files/);
    rmSync(path.join(root, 'new-page.js'));
    mkdirSync(path.join(root, 'node_modules/payload'), { recursive: true });
    writeFileSync(path.join(root, 'node_modules/payload/bin.js'), '');
    mkdirSync(path.join(root, '.next'));
    writeFileSync(path.join(root, '.next/BUILD_ID'), 'legacy-build');
    writeFileSync(path.join(root, '.next/visual-review-build.json'), JSON.stringify({ headSha: git(['rev-parse', 'HEAD']), buildId: 'legacy-build' }));
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /clean-source exact-head fixture build/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('exploration accepts only the isolated local fixture and removes provider credentials', () => {
  assert.equal(fixtureOrigin('http://127.0.0.1:4321'), 'http://127.0.0.1:4321');
  for (const url of ['https://mstefan.dev', 'http://localhost:4321', 'file:///tmp/page.html', 'http://user:secret@127.0.0.1:4321', 'http://127.0.0.1:4321/path']) assert.throws(() => fixtureOrigin(url));
  assert.deepEqual(reviewEnvironment({ PATH: '/bin', HOME: '/home/reviewer', NOTION_TOKEN: 'opaque', OPENAI_API_KEY: 'opaque', NODE_OPTIONS: '--require hostile.cjs', PLAYWRIGHT_MCP_CDP_ENDPOINT: 'remote' }), { PATH: '/bin', HOME: '/home/reviewer' });
  for (const tool of ['browser_run_code', 'browser_evaluate', 'browser_file_upload', 'browser_install']) assert.ok(!browserTools.includes(tool));
});

test('a no-findings report cannot pass without concrete browser evidence', () => {
  const report = { base_sha: 'base', head_sha: 'head', status: 'complete', summary: 'Review completed', scenarios: [], findings: [], evidence_gaps: [] };
  const empty = assessEvidence(report, [], [], 'base', 'head');
  assert.equal(empty.status, 'incomplete');
  assert.ok(empty.evidence_gaps.includes('No successful browser navigation'));
  assert.ok(empty.evidence_gaps.includes('No retained screenshot evidence'));
  assert.ok(empty.evidence_gaps.includes('No finalized Playwright trace'));
});

test('complete exploration preserves findings and fails closed on partial or wrong-ref evidence', () => {
  const events = ['browser_navigate', 'browser_snapshot', 'browser_take_screenshot', 'browser_stop_tracing'].map(tool => ({ type: 'item.completed', item: { type: 'mcp_tool_call', status: 'completed', tool } }));
  events[2].item.result = { content: [{ type: 'image', mimeType: 'image/png', data: 'test-image' }] };
  const files = ['page.png', 'trace-123.trace', 'session.json'];
  const report = { base_sha: 'base', head_sha: 'head', status: 'complete', summary: 'Review completed', scenarios: [{ name: 'Mobile menu', steps: ['Open the menu'], observed: 'Menu remained usable in the narrow viewport', screenshot: 'page.png' }], findings: [], evidence_gaps: [] };
  assert.equal(assessEvidence(report, events, files, 'base', 'head').status, 'complete');
  const textOnly = events.map(event => ({ ...event, item: { ...event.item, result: { content: [{ type: 'text', text: 'Saved screenshot' }] } } }));
  assert.equal(assessEvidence(report, textOnly, files, 'base', 'head').status, 'incomplete');
  assert.equal(assessEvidence({ ...report, findings: [{ title: 'Visible overlap', severity: 'P2', location: 'Menu', contract: 'Keep controls readable', evidence: 'page.png', reproduction: ['Open menu'] }] }, events, files, 'base', 'head').status, 'findings');
  assert.equal(assessEvidence({ ...report, evidence_gaps: ['Dark theme not exercised'] }, events, files, 'base', 'head').status, 'incomplete');
  assert.equal(assessEvidence(report, events, files, 'base', 'new-head').status, 'incomplete');
  assert.equal(assessEvidence({ ...report, scenarios: [{ observed: 'Claim without saved pixels', screenshot: 'missing.png' }] }, events, files, 'base', 'head').status, 'incomplete');
  const failed = events.map(event => ({ ...event, item: { ...event.item, status: 'failed' } }));
  assert.equal(assessEvidence(report, failed, files, 'base', 'head').status, 'incomplete');
});


test('remote review accepts only the canonical matching PR preview and isolates account configuration', () => {
  assert.equal(previewOrigin('https://pr-42.preview.mstefan.dev', '42'), 'https://pr-42.preview.mstefan.dev');
  for (const value of ['https://pr-43.preview.mstefan.dev', 'https://pr-042.preview.mstefan.dev', 'https://pr-42.preview.mstefan.dev/path', 'https://pr-42.preview.mstefan.dev:443', 'https://user@pr-42.preview.mstefan.dev', 'https://pr-42.preview.mstefan.dev?x', 'http://pr-42.preview.mstefan.dev']) assert.throws(() => previewOrigin(value, '42'));
  assert.throws(() => previewOrigin('https://pr-42.preview.mstefan.dev', '042'));
  const env = reviewEnvironment({ PATH: '/bin', HOME: '/real/home', CODEX_HOME: '/real/config', OPENAI_API_KEY: 'secret', CODEX_REVIEW_KEY: 'secret', NOTION_TOKEN: 'secret', MODEL_REVIEW_BASE_URL: 'http://127.0.0.1:8080/v1' }, '/tmp/isolated-review');
  assert.deepEqual(env, { PATH: '/bin', HOME: '/tmp/isolated-review', CODEX_HOME: '/tmp/isolated-review/.codex', CODEX_REVIEW_KEY: 'local-review-relay' });
  assert.ok(relayProviderOverrides('http://127.0.0.1:8080/v1').includes('model_providers.review_relay.wire_api="responses"'));
  for (const url of ['https://api.openai.com/v1', 'http://localhost:8080/v1', 'http://127.0.0.1:8080/v1?key=secret']) assert.throws(() => relayProviderOverrides(url));
});

test('remote browser aborts writes, provider requests and external redirects while preserving same-origin navigation', async () => {
  const origin = 'https://pr-42.preview.mstefan.dev';
  const source = remoteBrowserInit(origin);
  assert.ok(!source.includes('installOfflineReview'));
  const { default: init } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  let handler;
  let websocketsBlocked = false;
  const context = { routeWebSocket: async (_, callback) => { callback({ close: () => { websocketsBlocked = true; } }); }, route: async (_, callback) => { handler = callback; } };
  await init({ page: { context: () => context } });
  assert.ok(websocketsBlocked);
  const request = async (url, method = 'GET', location) => {
    let fetched = false, fulfilled = false, aborted = false;
    await handler({ request: () => ({ url: () => url, method: () => method }), abort: async () => { aborted = true; }, fetch: async options => { assert.equal(options.maxRedirects, 0); fetched = true; return { headers: () => location ? { location } : {} }; }, fulfill: async () => { fulfilled = true; } });
    return { fetched, fulfilled, aborted };
  };
  assert.deepEqual(await request(`${origin}/work?lang=it`), { fetched: true, fulfilled: true, aborted: false });
  assert.deepEqual(await request(`${origin}/image.png`, 'HEAD'), { fetched: true, fulfilled: true, aborted: false });
  for (const [url, method] of [[`${origin}/api/contact`, 'POST'], ['https://api.notion.com/v1/pages', 'GET'], ['https://mstefan.dev/', 'GET']]) assert.deepEqual(await request(url, method), { fetched: false, fulfilled: false, aborted: true });
  for (const url of ['https://api.iconify.design/simple-icons.json?icons=github%2Clinkedin', 'https://api.simplesvg.com/lucide.json?icons=mail', 'https://api.unisvg.com/simple-icons/github.svg']) assert.deepEqual(await request(url), { fetched: true, fulfilled: true, aborted: false });
  for (const url of ['https://api.iconify.design/simple-icons.json?icons=github&token=secret', 'https://api.iconify.design/search?query=github', 'https://api.iconify.design/simple-icons/github.svg?token=secret']) assert.deepEqual(await request(url), { fetched: false, fulfilled: false, aborted: true });
  assert.deepEqual(await request('https://api.iconify.design/simple-icons/github.svg', 'POST'), { fetched: false, fulfilled: false, aborted: true });
  assert.deepEqual(await request('https://api.iconify.design/simple-icons/github.svg', 'GET', 'https://api.notion.com/'), { fetched: true, fulfilled: false, aborted: true });
  assert.deepEqual(await request(`${origin}/redirect`, 'GET', 'https://api.notion.com/'), { fetched: true, fulfilled: false, aborted: true });
  assert.deepEqual(await request(`${origin}/redirect`, 'GET', '/about'), { fetched: true, fulfilled: true, aborted: false });
});

test('malformed reviewer output fails closed without throwing', () => {
  for (const report of [null, {}, { scenarios: 'invalid' }, { scenarios: [null], findings: 'invalid', evidence_gaps: {} }, { scenarios: [{ observed: 'Observation', screenshot: 42 }] }]) assert.equal(assessEvidence(report, [], [], 'base', 'head').status, 'incomplete');
});

test('remote preparation uses inert exact git objects without executing candidate fixtures', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'remote-review-'));
  const output = path.join(root, '.artifacts/review');
  const runner = fileURLToPath(new URL('../scripts/visual-review/explore.mjs', import.meta.url));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  let packet;
  try {
    git(['init', '-q']);
    writeFileSync(path.join(root, '.gitignore'), '.artifacts/\n');
    mkdirSync(path.join(root, '.github'));
    for (const file of ['AGENTS.md', 'DESIGN.md', '.github/PR_POLICY.md']) writeFileSync(path.join(root, file), 'Trusted base contract');
    git(['add', '.']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'base']);
    const ancestor = git(['rev-parse', 'HEAD']);
    writeFileSync(path.join(root, 'candidate.mjs'), "throw new Error('Candidate must never execute');");
    git(['add', '.']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'candidate']);
    const head = git(['rev-parse', 'HEAD']);
    git(['checkout', '-q', ancestor]);
    writeFileSync(path.join(root, 'target-only.mjs'), 'Target branch implementation must not be attributed to the PR');
    writeFileSync(path.join(root, 'AGENTS.md'), 'Current target approved contract');
    git(['add', '.']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'target advances']);
    const base = git(['rev-parse', 'HEAD']);
    const args = [runner, '--base-ref', base, '--head-ref', head, '--preview-url', 'https://pr-42.preview.mstefan.dev', '--pr-number', '42', '--output-dir', output, '--prepare-only'];
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH, MODEL_REVIEW_BASE_URL: 'http://127.0.0.1:8080/v1' } });
    assert.equal(result.status, 0, result.stderr);
    const invocation = JSON.parse(readFileSync(path.join(output, 'invocation.json'), 'utf8'));
    packet = invocation.packet;
    assert.equal(invocation.head, head);
    assert.equal(invocation.base, base);
    assert.equal(invocation.authoredBase, ancestor);
    assert.ok(invocation.args.includes('--ignore-user-config'));
    assert.ok(invocation.args.includes('read-only'));
    assert.ok(!existsSync(path.join(packet, 'e2e/offline-review.ts')));
    assert.ok(!readFileSync(path.join(packet, 'init-page.ts'), 'utf8').includes('import'));
    assert.match(readFileSync(path.join(output, 'review-packet.txt'), 'utf8'), /Candidate must never execute/);
    assert.match(readFileSync(path.join(output, 'review-packet.txt'), 'utf8'), /Current target approved contract/);
    assert.ok(!readFileSync(path.join(output, 'review-packet.txt'), 'utf8').includes('target-only.mjs'));
    assert.ok(invocation.args.includes('mcp_servers.browser.env={}'));
  } finally { rmSync(root, { recursive: true, force: true }); if (packet) rmSync(packet, { recursive: true, force: true }); }
});
