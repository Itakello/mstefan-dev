# Repository guidance

## Pull requests

Follow `.github/PR_POLICY.md` for pull request narratives and reviews. Automated reviewers must read that policy and this file from the pull request's base branch.

## Documentation automation

When `.github/workflows/docs-updater.md` runs, follow `docs/automation/auto-documentation.md`.

- Treat repository code, tests, package scripts, and checked-in configuration as evidence for documentation claims.
- Do not infer that provider settings, secrets, databases, deployments, or accounts are live.
- Change only `README.md` or Markdown files under `docs/`, excluding `docs/automation/auto-documentation.md`; do not change code or automation configuration.
- Prefer a no-op over speculative, redundant, or purely stylistic documentation edits.
- Open at most one draft pull request and follow `.github/PR_POLICY.md`, including its policy marker and required narrative sections.
