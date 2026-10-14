export const EXPLORATION_STEP = 'Reserve Codex UI exploration (2000000 microUSD)';
export const EXPLORATION_MICRO_USD = 2000000;
const runStates = new Set(['queued', 'pending', 'waiting', 'requested', 'in_progress', 'completed']);
const stepStates = new Set(['queued', 'pending', 'in_progress', 'completed']);
const conclusions = new Set(['success', 'failure', 'cancelled', 'skipped', 'timed_out', 'action_required', 'neutral', 'stale']);
function ensure(condition, message) { if (!condition) throw new Error(message); }
function timestamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }

async function history(github, endpoint, key, allowNotFound = false) {
  const items = [];
  let total;
  for (let page = 1; page <= 10; page++) {
    const batch = await github(`${endpoint}&per_page=100&page=${page}`, allowNotFound && page === 1 ? { allowNotFound: true } : {});
    if (allowNotFound && page === 1 && batch === null) return [];
    ensure(batch && Number.isSafeInteger(batch.total_count) && batch.total_count >= 0 && batch.total_count <= 1000 && Array.isArray(batch[key]) && batch[key].length <= 100, 'Exploration budget history missing or truncated');
    total ??= batch.total_count;
    ensure(total === batch.total_count, 'Exploration budget history changed');
    items.push(...batch[key]);
    if (items.length === total) break;
    ensure(batch[key].length === 100 && items.length < total, 'Exploration budget history missing or truncated');
  }
  ensure(items.length === total && new Set(items.map(item => item?.id)).size === total, 'Exploration budget history truncated or duplicated');
  return items;
}

export async function explorationReservations(github, now = Date.now()) {
  ensure(Number.isFinite(now), 'Invalid exploration budget clock');
  // Queued runs can start long after creation; scan beyond GitHub's 35-day waiting lifetime.
  const since = encodeURIComponent(new Date(now - 36 * 86400000).toISOString());
  const cutoff = now - 86400000 - 900000;
  const runs = await history(github, `/actions/workflows/codex-ui-exploration.yml/runs?created=%3E%3D${since}`, 'workflow_runs', true);
  let count = 0;
  const currentRuns = new Set();
  for (const run of runs) {
    ensure(Number.isSafeInteger(run.id) && run.id > 0 && runStates.has(run.status) && timestamp(run.updated_at), 'Invalid exploration budget run');
    if (run.status === 'completed' && Date.parse(run.updated_at) < cutoff) continue;
    const jobs = await history(github, `/actions/runs/${run.id}/jobs?filter=all`, 'jobs');
    ensure(jobs.length || ['queued', 'pending', 'waiting', 'requested'].includes(run.status) || (run.status === 'completed' && run.conclusion === 'cancelled'), 'Exploration budget jobs missing');
    for (const job of jobs) {
      ensure(Number.isSafeInteger(job.id) && job.id > 0 && Number.isSafeInteger(job.run_attempt) && job.run_attempt > 0 && Array.isArray(job.steps), 'Invalid exploration budget job');
      const numbers = new Set();
      for (const step of job.steps) {
        ensure(step && typeof step.name === 'string' && Number.isSafeInteger(step.number) && step.number > 0 && !numbers.has(step.number), 'Invalid exploration budget step');
        numbers.add(step.number);
        if (!step.name.startsWith('Reserve Codex UI exploration')) continue;
        ensure(step.name === EXPLORATION_STEP && stepStates.has(step.status) && (step.conclusion == null || conclusions.has(step.conclusion)), 'Malformed exploration reservation');
        if (['queued', 'pending'].includes(step.status) || step.conclusion === 'skipped') {
          ensure(step.conclusion !== 'skipped' || step.status === 'completed', 'Malformed skipped exploration reservation');
          continue;
        }
        ensure(timestamp(step.started_at) && Date.parse(step.started_at) <= now && (step.status !== 'completed' || conclusions.has(step.conclusion)), 'Malformed started exploration reservation');
        if (Date.parse(step.started_at) >= cutoff) {
          count++;
          if (run.status === 'in_progress') currentRuns.add(String(run.id));
        }
      }
    }
  }
  return { count, microUsd: count * EXPLORATION_MICRO_USD, currentRuns: [...currentRuns] };
}
