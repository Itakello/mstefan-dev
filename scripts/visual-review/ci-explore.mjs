import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startModelRelay } from './model-relay.mjs';
import { explore } from './explore.mjs';
import { paidAttempts, checkBudget } from './ai-review.mjs';
import { explorationReservations } from './exploration-budget.mjs';
import { classifyVisualReview } from './classify.mjs';

const REPO = 'Itakello/mstefan-dev';
const CONTEXT = 'Codex UI exploration';
const ensure = (value, message) => { if (!value) throw new Error(message); };
export function verifyPreview(pr, deployment, status) {
  const number = pr.number;
  ensure(Number.isSafeInteger(number) && number > 0, 'Invalid PR');
  ensure(pr.state === 'open' && pr.base.ref === 'master' && pr.base.repo.full_name === REPO && pr.head.repo?.full_name === REPO, 'Unsupported PR source');
  ensure(/^[a-f0-9]{40}$/.test(pr.head.sha) && /^[a-f0-9]{40}$/.test(pr.base.sha), 'Invalid refs');
  ensure(deployment.environment === `pr-${number}` && deployment.payload?.owner === 'mstefan-pr-previews' && deployment.payload?.pr === number && deployment.sha === pr.head.sha && deployment.production_environment === false, 'Preview deployment mismatch');
  const url = `https://pr-${number}.preview.mstefan.dev`;
  ensure(status.state === 'success' && status.environment_url?.replace(/\/$/, '') === url, 'Preview is not ready');
  return { number, head: pr.head.sha, base: pr.base.sha, url, deploymentId: deployment.id };
}
export async function main({ env = process.env, fetcher = fetch } = {}) {
  ensure(env.GITHUB_REPOSITORY === REPO && env.GITHUB_RUN_ATTEMPT === '1', 'Unsupported source or rerun');
  ensure(env.GITHUB_REF === 'refs/heads/master', 'Only protected master may run the privileged controller');
  const token = env.GITHUB_TOKEN;
  const github = async (suffix, options = 'GET', body) => {
    const method = typeof options === 'string' ? options : options.method || 'GET';
    const response = await fetcher(`https://api.github.com/repos/${REPO}${suffix}`, {
      method, headers: { authorization: `Bearer ${token}`, accept: options.accept || 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: options.raw ? 'follow' : 'error', signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404 && options.allowNotFound) return null;
    ensure(response.ok, `GitHub request failed (${response.status})`);
    return options.raw ? response.text() : response.json();
  };
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
  let number;
  if (env.GITHUB_EVENT_NAME === 'workflow_run') {
    const run = await github(`/actions/runs/${event.workflow_run.id}`);
    ensure(run.path === '.github/workflows/pr-previews.yml' && run.event === 'pull_request_target' && run.conclusion === 'success' && run.head_repository.full_name === REPO && run.pull_requests.length === 1, 'Untrusted preview producer');
    const jobs = await github(`/actions/runs/${run.id}/jobs?per_page=100`);
    ensure(jobs.total_count === jobs.jobs.length && jobs.jobs.some(job => job.name === 'preview' && job.conclusion === 'success'), 'Preview producer did not deploy');
    number = run.pull_requests[0].number;
  } else {
    ensure(env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'Unsupported trigger');
    number = Number(event.inputs?.pr_number);
  }
  ensure(Number.isSafeInteger(number) && number > 0, 'Missing preview PR identity');
  const pr = await github(`/pulls/${number}`);
  const deployments = await github(`/deployments?environment=pr-${number}&per_page=100`);
  const deployment = deployments.find(row => row.sha === pr.head.sha && row.payload?.owner === 'mstefan-pr-previews');
  ensure(deployment, 'No current-head preview deployment');
  const statuses = await github(`/deployments/${deployment.id}/statuses?per_page=100`);
  const review = verifyPreview(pr, deployment, statuses[0] || {});
  const status = (state, description) => github(`/statuses/${review.head}`, 'POST', {
    state, context: CONTEXT, description: `PR${number} ${review.base}: ${description}`.slice(0, 140),
    target_url: `https://github.com/${REPO}/actions/runs/${env.GITHUB_RUN_ID}`,
  });
  const output = path.resolve('.artifacts/codex-ui-exploration');
  const revalidate = async () => {
    const current = await github(`/pulls/${number}`);
    ensure(current.head.sha === review.head && current.base.sha === review.base && current.state === 'open', 'PR changed before model request');
    const latest = await github(`/deployments/${deployment.id}/statuses?per_page=100`);
    verifyPreview(current, deployment, latest[0] || {});
  };
  let relay;
  try {
    const files = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await github(`/pulls/${number}/files?per_page=100&page=${page}`);
      ensure(Array.isArray(batch), 'Invalid changed-file inventory');
      files.push(...batch);
      if (batch.length < 100) break;
    }
    ensure(files.length === pr.changed_files && files.length < 1000, 'Changed-file inventory truncated');
    const classification = classifyVisualReview(files.flatMap(file => [file.filename, ...(file.previous_filename ? [file.previous_filename] : [])]), { force: pr.labels?.some(label => label.name === 'visual-review') });
    if (!classification.run) {
      await status('success', 'No UI-impacting changes; no model request');
      return;
    }
    ensure(env.ENABLED === 'true', 'Automatic exploration is paused');
    const expiry = Date.parse(env.EXPIRES_AT);
    ensure(Number.isFinite(expiry) && Date.now() < expiry && expiry - Date.now() <= 7 * 86400_000, 'Exploration pilot expired or exceeds seven days');
    const previous = await github(`/commits/${review.head}/statuses?per_page=100`);
    ensure(previous.length < 100, 'Status history truncated');
    const marker = `PR${number} ${review.base}:`;
    ensure(!previous.some(item => item.context === CONTEXT && item.description?.startsWith(marker) && item.description.includes('request claimed')), 'Revision already attempted; no replay');
    if (!process.argv.includes('--run')) {
      await status('pending', 'preview verified; awaiting bounded session');
      await writeFile(env.GITHUB_OUTPUT, 'review_required=true\n', { flag: 'a' });
      return;
    }
    const trustedSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const history = await paidAttempts(github, Date.now(), undefined, undefined, trustedSha);
    const reservations = await explorationReservations(github, Date.now());
    ensure(reservations.currentRuns.includes(env.GITHUB_RUN_ID), 'Current paid reservation is not visible');
    checkBudget({ microUsd: history.microUsd + reservations.microUsd, count: history.count + reservations.count }, 0);
    await revalidate();
    await status('pending', 'request claimed; no retries');
    execFileSync('git', ['fetch', '--no-tags', 'origin', review.base, review.head], { stdio: 'pipe' });
    const response = await fetcher(`${review.url}/en/about`, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    ensure(response.ok, 'Preview readiness probe failed');
    relay = await startModelRelay({ key: env.OPENAI_API_KEY, fetcher, origin: review.url, beforeRequest: revalidate });
    const result = await explore(['--base-ref', review.base, '--head-ref', review.head, '--preview-url', review.url, '--pr-number', String(number), '--output-dir', output], {
      PATH: env.PATH, TMPDIR: env.TMPDIR, LANG: env.LANG, PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH,
      CODEX_BINARY: env.CODEX_BINARY, MODEL_REVIEW_BASE_URL: relay.baseUrl,
    });
    await writeFile(path.join(output, 'usage.json'), JSON.stringify(relay.usage(), null, 2));
    const current = await github(`/pulls/${number}`);
    ensure(current.head.sha === review.head && current.base.sha === review.base && current.state === 'open', 'PR changed during exploration');
    const freshStatuses = await github(`/deployments/${deployment.id}/statuses?per_page=100`);
    verifyPreview(current, deployment, freshStatuses[0] || {});
    const usage = relay.usage();
    ensure(!usage.terminal && usage.calls > 0 && usage.receipts.every(row => row.settled), 'Model usage is incomplete');
    await status(result.status === 'complete' ? 'success' : 'failure', `${result.status}; ${result.report?.scenarios?.length || 0} explored scenarios`);
    if (result.status !== 'complete') process.exitCode = 1;
    await writeFile(env.GITHUB_STEP_SUMMARY, `Codex explored [PR ${number}](${review.url}) at \`${review.head}\` against \`${review.base}\`.\n\nResult: ${result.status}. Scenarios and findings are in the retained report; screenshots were chosen by Codex.\n\nUsage: $${(usage.chargedMicroUsd / 1_000_000).toFixed(6)}; ${usage.calls} model turns.\n`);
  } catch (error) {
    await status('error', `incomplete: ${error.message}`);
    throw error;
  } finally {
    if (relay) {
      await writeFile(path.join(output, 'usage.json'), JSON.stringify(relay.usage(), null, 2)).catch(() => {});
      await relay.close();
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
