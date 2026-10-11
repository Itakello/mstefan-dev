import { readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyRevision, paidAttempts, checkBudget, alreadyAttempted, PAID_STEP } from './ai-review.mjs';

const REPOSITORY = 'Itakello/mstefan-dev';
const BASE = 'a09022470d7bc1365d1694583f31278bb49299f9';
const EXPIRES = Date.parse('2026-10-11T16:00:00Z');
class RecoveryError extends Error {}
function ensure(value, message) { if (!value) throw new RecoveryError(message); }
function context(env, now) {
  ensure(env.GITHUB_REPOSITORY === REPOSITORY, 'Recovery repository mismatch');
  ensure(env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'Recovery requires manual dispatch');
  ensure(env.GITHUB_ACTOR === 'Itakello' && env.GITHUB_TRIGGERING_ACTOR === 'Itakello', 'Recovery owner mismatch');
  ensure(env.GITHUB_RUN_ATTEMPT === '1', 'Recovery reruns forbidden');
  ensure(env.GITHUB_REF === 'refs/heads/codex/visual-ai-budget', 'Recovery ref mismatch');
  ensure(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') && /^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? ''), 'Invalid recovery run identity');
  ensure(Number.isFinite(now) && now < EXPIRES, 'Recovery expired');
}
function jsonFile(path, maxBytes) {
  try {
    const bytes = readFileSync(path);
    ensure(bytes.length <= maxBytes, 'Recovery file too large');
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    if (error instanceof RecoveryError) throw error;
    throw new RecoveryError('Invalid recovery file');
  }
}

// Read-only gate: run once before exposing OpenAI credentials and again in the fixed reservation step.
export async function main({env = process.env, fetcher = fetch, now = Date.now, reserve = false} = {}) {
  context(env, now());
  const event = jsonFile(env.GITHUB_EVENT_PATH, 64 * 1024);
  ensure(event.inputs?.recovery === true || event.inputs?.recovery === 'true', 'Recovery opt-in required');
  const source = event.inputs?.source_run_id;
  ensure(typeof source === 'string' && /^[1-9]\d*$/.test(source), 'Invalid recovery source run');
  ensure(env.GITHUB_TOKEN, 'Missing GitHub credential');
  let markerVisible = false;
  async function github(path) {
    let response;
    try {
      response = await fetcher(`https://api.github.com/repos/${REPOSITORY}${path}`, {
        method:'GET', headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json'},
        signal:AbortSignal.timeout(30000),
      });
    } catch { throw new RecoveryError('GitHub request failed'); }
    ensure(response.ok, `GitHub request failed (${response.status})`);
    let result;
    try {
      const text = await response.text();
      ensure(Buffer.byteLength(text) <= 5 * 1024 * 1024, 'GitHub response too large');
      result = JSON.parse(text);
    } catch (error) {
      if (error instanceof RecoveryError) throw error;
      throw new RecoveryError('Invalid GitHub response');
    }
    if (path === `/actions/runs/${env.GITHUB_RUN_ID}/jobs?filter=all&per_page=100`) {
      markerVisible = result.jobs?.some(job => job.steps?.some(step => step.name === PAID_STEP && step.status === 'in_progress' && Date.parse(step.started_at) >= now() - 86400000 - 600000)) === true;
    }
    return result;
  }
  const pr = await github('/pulls/129');
  const run = await github(`/actions/runs/${source}`);
  ensure(pr.number === 129 && pr.head?.sha === env.GITHUB_SHA && pr.base?.sha === BASE, 'Recovery head/base mismatch');
  ensure(String(run.id) === source && run.conclusion === 'success', 'Recovery source mismatch');
  try { verifyRevision(pr, run, REPOSITORY); } catch { throw new RecoveryError('Recovery source revision invalid'); }
  const statuses = await github(`/commits/${pr.head.sha}/statuses?per_page=100`);
  ensure(Array.isArray(statuses) && statuses.length < 100 && statuses.every(status => typeof status.context === 'string' && typeof status.description === 'string'), 'Recovery status history incomplete');
  ensure(!alreadyAttempted(statuses, `PR129 ${BASE}`), 'Recovery request already claimed');
  if (reserve) {
    const path = join(env.RUNNER_TEMP, 'ai-visual-request.json');
    let stat;
    try { stat = lstatSync(path); } catch { throw new RecoveryError('Missing prepared recovery request'); }
    ensure(stat.isFile() && (stat.mode & 0o777) === 0o600, 'Prepared recovery request must be mode 0600');
    const prepared = jsonFile(path, 100 * 1024 * 1024);
    ensure(prepared.sha === pr.head.sha && prepared.base === BASE && prepared.sourceRun === run.id, 'Prepared recovery revision mismatch');
    ensure(Number.isSafeInteger(prepared.reservedMicroUsd) && prepared.reservedMicroUsd > 180000 && prepared.reservedMicroUsd <= 2000000, 'Invalid recovery reservation amount');
    let history;
    try { history = await paidAttempts(github, now(), env.GITHUB_RUN_ID); }
    catch (error) {
      if (error instanceof RecoveryError) throw error;
      throw new RecoveryError('Recovery paid history incomplete');
    }
    ensure(markerVisible, 'Current fixed recovery reservation not visible');
    try { checkBudget(history, prepared.reservedMicroUsd); } catch { throw new RecoveryError('Recovery paid budget exceeded'); }
  }
  context(env, now());
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main({reserve:process.argv.includes('--reserve')}).catch(error => {
    console.error(error instanceof RecoveryError ? error.message : 'Recovery validation failed');
    process.exitCode = 1;
  });
}
