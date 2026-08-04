# Auto-documentation pilot

This repository is piloting GitHub Agentic Workflows with Codex to detect documentation drift and propose reviewable updates. Repository Markdown remains the source of truth; Codex may draft changes but cannot merge them.

## Current state

The pilot is manual-only. `.github/workflows/docs-updater.md` is the editable workflow source, and `.github/workflows/docs-updater.lock.yml` is its generated GitHub Actions workflow. A weekly schedule is proposed only after the manual proof and replay checks below succeed.

## Operating contract

| Concern | Pilot contract |
| --- | --- |
| Trigger | Maintainer-initiated `workflow_dispatch`; no unattended schedule; skip while an open `[docs-auto]` pull request exists |
| Inputs | The current default-branch checkout, including code, tests, package scripts, workflows, `README.md`, and `docs/` |
| Evidence boundary | Repository evidence only; no claims that provider settings, secrets, databases, deployments, or accounts are live |
| Write scope | At most one draft pull request per run changing only `README.md` or `docs/**`, excluding this contract file; the pre-activation search prevents overlapping automation pull requests |
| Merge authority | Human review and merge only |
| Model | Codex with `gpt-5.6-luna`; high reasoning is pinned; `max` requires evidence that high misses material documentation drift |
| Per-run bounds | 20 minutes, 12 turns, and 200 AI credits |
| Pilot duration | Runs stop after 2026-09-03 unless the workflow is explicitly recompiled and reviewed |
| First-week budget | No more than two manual invocations before the 2026-08-11 review |
| Retry policy | No automatic retries; inspect the failed run, correct the cause, then dispatch once manually |
| Deduplication | A run is skipped while an open `[docs-auto]` pull request exists; a replay after it closes must produce no pull request when documentation already matches the code |
| Success | One accurate draft documentation PR or a verified no-op, followed by a no-op replay; no out-of-scope writes |

## Condition-to-action mapping

| Detected condition | Authorized action |
| --- | --- |
| Documentation matches repository evidence | `observe`: record a no-op in the Actions summary and finish without a pull request |
| An open `[docs-auto]` pull request exists | `block`: skip before agent execution, avoiding duplicate work and inference cost |
| Verified drift within `README.md` or `docs/**` | `write`: open one expiring draft pull request |
| A claim depends on live provider or account state | `warn`: record the uncertainty in the run or pull request; do not assert it as fact |
| A proposed patch touches any other path or this contract | `block`: the safe-output policy rejects or strips the change |
| The OpenAI credential is missing or the agent fails | `block`: fail the Actions run visibly; do not retry automatically |
| Two consecutive runs produce no useful change | `request approval`: pause and reassess before any further invocation |
| A draft pull request is ready | `request approval`: a human reviews and decides whether to merge |

## Manual proof before scheduling

1. Compile and validate the workflow source.
2. Configure a dedicated `OPENAI_API_KEY` and a fine-grained `GH_AW_CI_TRIGGER_TOKEN` that can create the draft pull request and trigger its required checks. Do not dispatch without both secrets.
3. Run it once from GitHub Actions against the default branch.
4. Inspect the complete run and any proposed draft pull request.
5. Confirm that every changed file is allowed, every documentation claim is supported by repository evidence, and both `policy-gate` and `verify` ran on the draft pull request.
6. Dispatch again while the automation pull request is open and confirm the run skips before inference.
7. Replay the same input after accepting or rejecting the documentation change. The replay must no-op or produce a clearly bounded correction.
8. Exercise one expected failure, such as a deliberately unavailable test credential in a non-writing trial, and confirm that it is visible and terminal.
9. Review cost, duration, usefulness, and noise on 2026-08-11 before proposing a weekly schedule.

## Pause and recovery

- Disable the generated workflow in GitHub Actions to stop all runs.
- Set the repository Actions variable `GH_AW_POLICY_ALLOW_CREATE_PULL_REQUEST=false` to block pull-request creation without recompiling.
- Close an unwanted automation pull request; no default-branch content changes until a human merges it.
- Revert a merged documentation commit through the normal pull-request process if a factual error reaches the default branch.

Enabling a schedule, increasing the model or credit budget, widening the allowed paths, extending the stop date, or granting merge authority requires a separate reviewed change.
