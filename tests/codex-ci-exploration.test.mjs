import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startModelRelay, reserveCost } from '../scripts/visual-review/model-relay.mjs';
import { verifyPreview, main } from '../scripts/visual-review/ci-explore.mjs';

const pr = { number: 147, state: 'open', changed_files: 1, labels: [], base: { ref: 'master', sha: 'b'.repeat(40), repo: { full_name: 'Itakello/mstefan-dev' } }, head: { sha: 'a'.repeat(40), repo: { full_name: 'Itakello/mstefan-dev' } } };
const deployment = { id: 123, environment: 'pr-147', sha: pr.head.sha, production_environment: false, payload: { owner: 'mstefan-pr-previews', pr: 147 } };
const status = { state: 'success', environment_url: 'https://pr-147.preview.mstefan.dev' };
const browserCatalog = [{ type: 'namespace', name: 'mcp__browser__', tools: [{ type: 'function', name: 'browser_snapshot' }, { type: 'function', name: 'browser_navigate' }] }];

test('only a ready same-repository exact-head preview can enter review', () => {
  assert.equal(verifyPreview(pr, deployment, status).head, pr.head.sha);
  for (const changed of [{ sha: 'c'.repeat(40) }, { environment: 'production' }, { production_environment: true }, { payload: { owner: 'external', pr: 147 } }]) assert.throws(() => verifyPreview(pr, { ...deployment, ...changed }, status));
  assert.throws(() => verifyPreview(pr, deployment, { ...status, state: 'inactive' }));
  assert.throws(() => verifyPreview(pr, deployment, { ...status, environment_url: 'https://attacker.invalid' }));
  assert.throws(() => verifyPreview({ ...pr, head: { ...pr.head, repo: { full_name: 'fork/mstefan-dev' } } }, deployment, status));
});

test('controller rejects non-master workflows and reruns before provider access', async () => {
  const fetcher = () => { throw new Error('Provider must not be called'); };
  await assert.rejects(main({ env: { GITHUB_REPOSITORY: 'Itakello/mstefan-dev', GITHUB_RUN_ATTEMPT: '1', GITHUB_REF: 'refs/heads/untrusted' }, fetcher }), /protected master/);
  await assert.rejects(main({ env: { GITHUB_REPOSITORY: 'Itakello/mstefan-dev', GITHUB_RUN_ATTEMPT: '2' }, fetcher }), /rerun/);
});

test('an unpaid pause can be resumed; an existing paid claim cannot replay', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'codex-ci-preflight-'));
  const recorded = [];
  const env = { GITHUB_REPOSITORY: 'Itakello/mstefan-dev', GITHUB_RUN_ATTEMPT: '1', GITHUB_REF: 'refs/heads/master', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_EVENT_PATH: path.join(directory, 'event.json'), GITHUB_OUTPUT: path.join(directory, 'outputs'), GITHUB_RUN_ID: '123', ENABLED: 'false', EXPIRES_AT: new Date(Date.now() + 86400000).toISOString() };
  await writeFile(env.GITHUB_EVENT_PATH, JSON.stringify({ inputs: { pr_number: '147' } }));
  const fetcher = async (url, options) => {
    const pathname = new URL(url).pathname;
    if (options.method === 'POST') { recorded.unshift(JSON.parse(options.body)); return Response.json(recorded[0]); }
    if (pathname.endsWith('/pulls/147')) return Response.json(pr);
    if (pathname.endsWith('/pulls/147/files')) return Response.json([{ filename: 'components/menu.tsx' }]);
    if (pathname.endsWith('/deployments')) return Response.json([deployment]);
    if (pathname.endsWith('/deployments/123/statuses')) return Response.json([status]);
    if (pathname.endsWith(`/commits/${pr.head.sha}/statuses`)) return Response.json(recorded);
    throw new Error('Unexpected provider operation');
  };
  try {
    await assert.rejects(main({ env, fetcher }), /paused/);
    assert.equal(recorded[0].state, 'error');
    env.ENABLED = 'true';
    await main({ env, fetcher });
    assert.equal(recorded[0].state, 'pending');
    env.ENABLED = 'false';
    await writeFile(env.GITHUB_EVENT_PATH, JSON.stringify({ inputs: { pr_number: '147' }, sender: { login: 'Itakello' } }));
    await main({ env, fetcher });
    assert.equal(recorded[0].state, 'pending');
    await writeFile(env.GITHUB_EVENT_PATH, JSON.stringify({ inputs: { pr_number: '147' }, sender: { login: 'Other' } }));
    await assert.rejects(main({ env, fetcher }), /repository owner/);
    env.ENABLED = 'true';
    recorded.unshift({ context: 'Codex UI exploration', description: `PR147 ${pr.base.sha}: request claimed; no retries` });
    await assert.rejects(main({ env, fetcher }), /already attempted/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('model admission reserves all possible output before a paid request', () => {
  assert.equal(reserveCost(1000, 2_000_000), 185000);
  assert.throws(() => reserveCost(400000, 2_000_000), /dollar limit/);
  assert.throws(() => reserveCost(NaN, 2_000_000), /token count/);
});

test('relay retains its secret, settles streamed usage, and fails closed without retries', async () => {
  const seen = [];
  let tokens = 1000;
  const fetcher = async (url, options) => {
    seen.push({ url, body: JSON.parse(options.body), authorization: options.headers.authorization });
    if (url.endsWith('/input_tokens')) return Response.json({ object: 'response.input_tokens', input_tokens: tokens });
    return new Response('data: ' + JSON.stringify({ type: 'response.completed', response: { id: 'resp_synthetic', status: 'completed', model: 'gpt-6.1-sol', service_tier: 'default', output: [], usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 } } }) + '\n\n', { headers: { 'content-type': 'text/event-stream' } });
  };
  const relay = await startModelRelay({ key: 'synthetic-secret', fetcher });
  const send = () => fetch(relay.baseUrl + '/responses', { method: 'POST', body: JSON.stringify({ model: 'gpt-6.1-sol', stream: true, input: 'Review', max_output_tokens: 999999, store: true, tools: [{ type: 'function', name: 'view_image' }, { type: 'namespace', name: 'mcp__browser__', tools: [{ type: 'function', name: 'browser_snapshot' }] }] }) });
  try {
    assert.equal((await send()).status, 200);
    assert.equal(relay.usage().chargedMicroUsd, 6500);
    assert.equal(relay.usage().receipts[0].settled, true);
    assert.equal(seen[1].body.max_output_tokens, 12000);
    assert.equal(seen[1].body.store, false);
    assert.equal(seen[1].body.reasoning.effort, 'medium');
    assert.deepEqual(seen[1].body.tools.map(tool => tool.name), ['mcp__browser__']);
    assert.ok(seen.every(call => call.authorization === 'Bearer synthetic-secret'));
    tokens = 400000;
    assert.equal((await send()).status, 503);
    assert.equal(seen.filter(call => call.url.endsWith('/responses')).length, 1);
    assert.equal((await send()).status, 503);
    assert.equal(seen.length, 3);
    assert.equal(relay.usage().terminal, true);
  } finally { await relay.close(); }
});

test('an uncertain paid response keeps its full reservation and closes the lane', async () => {
  const relay = await startModelRelay({ key: 'synthetic-secret', fetcher: async url => url.endsWith('/input_tokens') ? Response.json({ object: 'response.input_tokens', input_tokens: 1000 }) : new Response('upstream failed', { status: 500 }) });
  try {
    const response = await fetch(relay.baseUrl + '/responses', { method: 'POST', body: JSON.stringify({ model: 'gpt-6.1-sol', input: 'Review', tools: browserCatalog }) });
    assert.equal(response.status, 503);
    assert.equal(relay.usage().chargedMicroUsd, 185000);
    assert.equal(relay.usage().receipts[0].settled, false);
    assert.ok(!(await response.text()).includes('synthetic-secret'));
  } finally { await relay.close(); }
});

test('forbidden streamed tool calls are never forwarded to the Codex runtime', async () => {
  const forbidden = { type: 'function_call', name: 'view_image', call_id: 'call_forbidden', arguments: '{"path":"/private/file.png"}' };
  const completed = { id: 'resp_synthetic', status: 'completed', model: 'gpt-6.1-sol', service_tier: 'default', output: [], usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 } };
  const stream = [{ type: 'response.output_item.added', item: forbidden }, { type: 'response.completed', response: completed }].map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('');
  const relay = await startModelRelay({ key: 'synthetic', fetcher: async url => url.endsWith('/input_tokens') ? Response.json({ object: 'response.input_tokens', input_tokens: 1000 }) : new Response(stream) });
  try {
    const response = await fetch(relay.baseUrl + '/responses', { method: 'POST', body: JSON.stringify({ model: 'gpt-6.1-sol', stream: true, input: 'Review', tools: browserCatalog }) });
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes('view_image'));
    assert.equal(relay.usage().receipts[0].settled, false);
  } finally { await relay.close(); }
});

test('a classic namespaced browser call survives partial SSE arguments and finalized validation', async () => {
  const call = { id: 'fc_browser', type: 'function_call', namespace: 'mcp__browser__', name: 'browser_navigate', call_id: 'call_browser', arguments: '{"url":"https://pr-147.preview.mstefan.dev/en"}' };
  const completed = { id: 'resp_synthetic', status: 'completed', model: 'gpt-6.1-sol', service_tier: 'default', output: [call], usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 } };
  const stream = [{ type: 'response.output_item.added', item: { ...call, arguments: '' } }, { type: 'response.output_item.done', item: call }, { type: 'response.completed', response: completed }].map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('');
  const relay = await startModelRelay({ key: 'synthetic', origin: 'https://pr-147.preview.mstefan.dev', fetcher: async url => url.endsWith('/input_tokens') ? Response.json({ object: 'response.input_tokens', input_tokens: 1000 }) : new Response(stream) });
  try {
    const response = await fetch(relay.baseUrl + '/responses', { method: 'POST', body: JSON.stringify({ model: 'gpt-6.1-sol', stream: true, input: 'Review', tools: browserCatalog }) });
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes('browser_navigate'));
    assert.equal(relay.usage().receipts[0].settled, true);
  } finally { await relay.close(); }
});

test('a CLI without browser tools is rejected before any upstream call', async () => {
  let called = false;
  const relay = await startModelRelay({ key: 'synthetic', fetcher: async () => { called = true; throw new Error('Unexpected upstream call'); } });
  try {
    const response = await fetch(relay.baseUrl + '/responses', { method: 'POST', body: JSON.stringify({ model: 'gpt-6.1-sol', input: 'Review', tools: [{ type: 'function', name: 'view_image' }] }) });
    assert.equal(response.status, 503);
    assert.equal(called, false);
    assert.equal(relay.usage().chargedMicroUsd, 0);
  } finally { await relay.close(); }
});

test('revision drift after token counting prevents paid generation', async () => {
  let paid = false;
  const relay = await startModelRelay({ key: 'synthetic', beforeRequest: async () => { throw new Error('PR head changed'); }, fetcher: async url => {
    if (url.endsWith('/input_tokens')) return Response.json({ object: 'response.input_tokens', input_tokens: 1000 });
    paid = true; throw new Error('Must not generate');
  } });
  try {
    const response = await fetch(relay.baseUrl + '/responses', { method: 'POST', body: JSON.stringify({ model: 'gpt-6.1-sol', input: 'Review', tools: browserCatalog }) });
    assert.equal(response.status, 503);
    assert.equal(paid, false);
    assert.equal(relay.usage().chargedMicroUsd, 0);
  } finally { await relay.close(); }
});
