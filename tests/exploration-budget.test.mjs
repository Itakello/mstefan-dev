import test from 'node:test';
import assert from 'node:assert/strict';
import { explorationReservations, EXPLORATION_STEP } from '../scripts/visual-review/exploration-budget.mjs';
import { checkBudget } from '../scripts/visual-review/ai-review.mjs';

const now = Date.parse('2026-10-13T12:00:00Z');
const recent = new Date(now - 1000).toISOString();
const run = (id = 1, values = {}) => ({ id, status: 'completed', conclusion: 'success', updated_at: recent, ...values });
const step = (values = {}) => ({ name: EXPLORATION_STEP, number: 1, status: 'completed', conclusion: 'success', started_at: recent, ...values });
const job = (id = 10, values = {}) => ({ id, run_attempt: 1, steps: [step()], ...values });
function github(runs, jobs, calls = []) {
  return async (endpoint, options) => {
    calls.push({ endpoint, options });
    const page = Number(new URL(`https://example.invalid${endpoint}`).searchParams.get('page'));
    const data = endpoint.includes('/workflows/') ? runs : jobs;
    return { total_count: data.length, [endpoint.includes('/workflows/') ? 'workflow_runs' : 'jobs']: data.slice((page - 1) * 100, page * 100) };
  };
}

test('started failed reservations and reruns count once per step, not settlement or job result', async () => {
  const jobs = [job(10, { steps: [step({ conclusion: 'failure' }), { ...step(), name: 'Report usage (0 microUSD)', number: 2 }] }), job(11, { run_attempt: 2, steps: [step({ status: 'in_progress', conclusion: null })] })];
  assert.deepEqual(await explorationReservations(github([run()], jobs), now), { count: 2, microUsd: 4000000, currentRuns: [] });
  assert.deepEqual((await explorationReservations(github([run(1, { status: 'in_progress' })], jobs), now)).currentRuns, ['1']);
  const queued = [step({ status: 'queued', conclusion: null, started_at: null }), step({ status: 'pending', conclusion: null, started_at: null, number: 2 }), step({ conclusion: 'skipped', number: 3 })];
  assert.deepEqual(await explorationReservations(github([run()], [job(10, { steps: queued })]), now), { count: 0, microUsd: 0, currentRuns: [] });
});

test('rolling boundary preserves the reservation for 24 hours plus fifteen minutes across old queued runs', async () => {
  const boundary = new Date(now - 86400000 - 900000).toISOString();
  const calls = [];
  const history = github([run(1, { created_at: '2026-09-10T00:00:00Z' })], [job(10, { steps: [step({ started_at: boundary })] })], calls);
  assert.deepEqual(await explorationReservations(history, now), { count: 1, microUsd: 2000000, currentRuns: [] });
  assert.deepEqual(await explorationReservations(history, now + 1), { count: 0, microUsd: 0, currentRuns: [] });
  assert.ok(calls[0].endpoint.includes('created=%3E%3D'));
  assert.ok(calls.some(call => call.endpoint.includes('filter=all')));
});

test('bounded complete pagination includes every run and every attempt', async () => {
  const calls = [];
  const runs = Array.from({ length: 101 }, (_, i) => run(i + 1));
  assert.deepEqual(await explorationReservations(github(runs, [job()], calls), now), { count: 101, microUsd: 202000000, currentRuns: [] });
  assert.ok(calls.some(call => call.endpoint.includes('/workflows/') && call.endpoint.endsWith('page=2')));
  const jobs = Array.from({ length: 101 }, (_, i) => job(i + 1, { run_attempt: i + 1 }));
  assert.deepEqual(await explorationReservations(github([run()], jobs), now), { count: 101, microUsd: 202000000, currentRuns: [] });
});

test('only explicit adapter 404 allowance before registration yields an empty history', async () => {
  assert.deepEqual(await explorationReservations(async (_, options) => { assert.equal(options.allowNotFound, true); return null; }, now), { count: 0, microUsd: 0, currentRuns: [] });
  await assert.rejects(explorationReservations(async () => { throw new Error('GitHub 403'); }, now), /403/);
  await assert.rejects(explorationReservations(async () => undefined, now), /missing/);
});

test('malformed, duplicate, truncated and changing provider history fail closed', async () => {
  for (const result of [{ total_count: 1001, workflow_runs: [] }, { total_count: 2, workflow_runs: [run()] }, { total_count: 2, workflow_runs: [run(), run()] }, { total_count: -1, workflow_runs: [] }]) await assert.rejects(explorationReservations(async () => result, now), /history/);
  let requests = 0;
  await assert.rejects(explorationReservations(async () => ({ total_count: ++requests === 1 ? 101 : 100, workflow_runs: Array.from({ length: requests === 1 ? 100 : 1 }, (_, i) => run(i + 1)) }), now), /changed/);
  for (const values of [{ status: 'unknown' }, { updated_at: 'invalid' }, { id: 0 }]) await assert.rejects(explorationReservations(github([run(1, values)], [job()]), now), /Invalid.*run/);
  await assert.rejects(explorationReservations(github([run()], []), now), /jobs missing/);
  for (const values of [{ name: 'Reserve Codex UI exploration (1 microUSD)' }, { status: 'unknown' }, { started_at: null }, { started_at: new Date(now + 1).toISOString() }, { conclusion: null }, { conclusion: 'unknown' }]) await assert.rejects(explorationReservations(github([run()], [job(10, { steps: [step(values)] })]), now), /reservation/);
  await assert.rejects(explorationReservations(github([run()], [job(10, { steps: [step(), step()] })]), now), /Invalid.*step/);
  await assert.rejects(explorationReservations(github([run()], [job(10, { run_attempt: 0 })]), now), /Invalid.*job/);
});

test('exploration reservations share the visual lane rolling dollar cap', async () => {
  const reserved = await explorationReservations(github([run()], [job()]), now);
  checkBudget({ count: 20 + reserved.count, microUsd: 6000000 + reserved.microUsd }, 2000000);
  assert.throws(() => checkBudget({ count: 20 + reserved.count, microUsd: 6000001 + reserved.microUsd }, 2000000), /dollar cap/);
});
