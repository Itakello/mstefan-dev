import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { verifyRevision, alreadyAttempted, verifyPolicyBase } from './ai-review.mjs';

const REPOSITORY = 'Itakello/mstefan-dev';
const BASE = '8776f7c4fb38309505626f13968f13d5ab903127';
const EXPIRES = Date.parse('2026-10-12T20:59:00Z');
class RecoveryError extends Error {}
function ensure(value, message) { if (!value) throw new RecoveryError(message); }
function context(env, now) {
  ensure(env.GITHUB_REPOSITORY === REPOSITORY, 'Recovery repository mismatch');
  ensure(env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'Recovery requires manual dispatch');
  ensure(env.GITHUB_ACTOR === 'Itakello' && env.GITHUB_TRIGGERING_ACTOR === 'Itakello', 'Recovery owner mismatch');
  ensure(env.GITHUB_RUN_ATTEMPT === '1', 'Recovery reruns forbidden');
  const engine = env.GITHUB_REF === 'refs/heads/fix/visual-review-file-inventory';
  ensure(engine || env.GITHUB_REF === 'refs/heads/codex/visual-usage-settlement', 'Recovery ref mismatch');
  ensure(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') && /^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? ''), 'Invalid recovery run identity');
  ensure(Number.isFinite(now) && now < (engine ? Date.parse('2026-10-12T03:00:00Z') : EXPIRES), 'Recovery expired');
  return engine;
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

// Owner-only settlement bootstrap runs before exposing OpenAI credentials.
export async function main({env = process.env, fetcher = fetch, now = Date.now} = {}) {
  const engine = context(env, now());
  const event = jsonFile(env.GITHUB_EVENT_PATH, 64 * 1024);
  ensure(event.inputs?.recovery === true || event.inputs?.recovery === 'true', 'Recovery opt-in required');
  const source = event.inputs?.source_run_id;
  ensure(typeof source === 'string' && /^[1-9]\d*$/.test(source), 'Invalid recovery source run');
  ensure(env.GITHUB_TOKEN, 'Missing GitHub credential');
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
    return result;
  }
  const accounting = await github(engine ? '/pulls/137' : '/pulls/138');
  const run = await github(`/actions/runs/${source}`);
  ensure(accounting.number === (engine ? 137 : 138) && accounting.head?.sha === env.GITHUB_SHA && (engine || accounting.base?.sha === BASE), 'Recovery head/base mismatch');
  if (engine) await verifyPolicyBase(github,accounting.base?.sha);
  ensure(String(run.id) === source && run.conclusion === 'success' && run.pull_requests?.length === 1, 'Recovery source mismatch');
  const number = run.pull_requests[0].number;
  ensure(engine ? number === 137 : [138,135].includes(number), 'Recovery PR outside approved scope');
  const pr = number === 135 ? await github('/pulls/135') : accounting;
  ensure(number !== 135 || accounting.merged === true && pr.base?.sha === accounting.merge_commit_sha, 'Accounting prerequisite not merged into category base');
  try { verifyRevision(pr, run, REPOSITORY); } catch { throw new RecoveryError('Recovery source revision invalid'); }
  const statuses = await github(`/commits/${pr.head.sha}/statuses?per_page=100`);
  ensure(Array.isArray(statuses) && statuses.length < 100 && statuses.every(status => typeof status.context === 'string' && typeof status.description === 'string'), 'Recovery status history incomplete');
  ensure(!alreadyAttempted(statuses, `PR${number} ${pr.base.sha}`), 'Recovery request already claimed');
  context(env, now());
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof RecoveryError ? error.message : 'Recovery validation failed');
    process.exitCode = 1;
  });
}
