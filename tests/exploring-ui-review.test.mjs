import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEvidence, browserTools, fixtureOrigin, reviewEnvironment } from '../scripts/visual-review/explore.mjs';

test('exploration accepts only the isolated local fixture and removes provider credentials', () => {
  assert.equal(fixtureOrigin('http://127.0.0.1:4321'), 'http://127.0.0.1:4321');
  for (const url of ['https://mstefan.dev', 'http://localhost:4321', 'file:///tmp/page.html', 'http://user:secret@127.0.0.1:4321', 'http://127.0.0.1:4321/path']) assert.throws(() => fixtureOrigin(url));
  assert.deepEqual(reviewEnvironment({ PATH: '/bin', HOME: '/home/reviewer', NOTION_TOKEN: 'opaque', OPENAI_API_KEY: 'opaque', NODE_OPTIONS: '--require hostile.cjs', PLAYWRIGHT_MCP_CDP_ENDPOINT: 'remote' }), { PATH: '/bin', HOME: '/home/reviewer' });
  for (const tool of ['browser_run_code', 'browser_evaluate', 'browser_file_upload', 'browser_install']) assert.ok(!browserTools.includes(tool));
});

test('a no-findings report cannot pass without concrete browser evidence', () => {
  const report = { base_sha: 'base', head_sha: 'head', status: 'complete', scenarios: [], findings: [], evidence_gaps: [] };
  const empty = assessEvidence(report, [], [], 'base', 'head');
  assert.equal(empty.status, 'incomplete');
  assert.ok(empty.evidence_gaps.includes('No successful browser navigation'));
  assert.ok(empty.evidence_gaps.includes('No retained screenshot evidence'));
  assert.ok(empty.evidence_gaps.includes('No finalized Playwright trace'));
});

test('complete exploration preserves findings and fails closed on partial or wrong-ref evidence', () => {
  const events = ['browser_navigate', 'browser_snapshot', 'browser_take_screenshot'].map(tool => ({ type: 'item.completed', item: { type: 'mcp_tool_call', status: 'completed', tool } }));
  events[2].item.result = { content: [{ type: 'image', mimeType: 'image/png', data: 'test-image' }] };
  const files = ['page.png', 'trace-123.zip', 'session.json'];
  const report = { base_sha: 'base', head_sha: 'head', status: 'complete', scenarios: [{ observed: 'Menu remained usable in the narrow viewport', screenshot: 'page.png' }], findings: [], evidence_gaps: [] };
  assert.equal(assessEvidence(report, events, files, 'base', 'head').status, 'complete');
  const textOnly = events.map(event => ({ ...event, item: { ...event.item, result: { content: [{ type: 'text', text: 'Saved screenshot' }] } } }));
  assert.equal(assessEvidence(report, textOnly, files, 'base', 'head').status, 'incomplete');
  assert.equal(assessEvidence({ ...report, findings: [{ title: 'Visible overlap' }] }, events, files, 'base', 'head').status, 'findings');
  assert.equal(assessEvidence({ ...report, evidence_gaps: ['Dark theme not exercised'] }, events, files, 'base', 'head').status, 'incomplete');
  assert.equal(assessEvidence(report, events, files, 'base', 'new-head').status, 'incomplete');
  assert.equal(assessEvidence({ ...report, scenarios: [{ observed: 'Claim without saved pixels', screenshot: 'missing.png' }] }, events, files, 'base', 'head').status, 'incomplete');
  const failed = events.map(event => ({ ...event, item: { ...event.item, status: 'failed' } }));
  assert.equal(assessEvidence(report, failed, files, 'base', 'head').status, 'incomplete');
});
