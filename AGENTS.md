# Repository guidance

## Pull requests

Follow `.github/PR_POLICY.md` for pull request narratives and reviews. Automated reviewers must read that policy and this file from the pull request's base branch.

## Code Review Rules

### Scope and sources of truth

- Flag production code or checked-in content that creates a second project or Stack publication source beside Notion, including silent fallback data. Safe path: keep Notion authoritative and fail closed; local fixtures are acceptable only when clearly test-scoped.
- Flag implementation, abstraction, compatibility logic, or cleanup that is not required by the pull request's stated outcome. Safe path: remove dead content and keep the smallest change that preserves the intended behavior.

### Documentation restraint

- Flag README, documentation, or comment edits that merely narrate the diff, restate obvious code or defaults, or document the removal of unused internals. Safe path: update documentation only when public behavior, setup, operator workflow, a supported contract, or an existing documented structure materially changes; correct claims that become false.

## Documentation automation

When `.github/workflows/docs-updater.md` runs, follow `docs/automation/auto-documentation.md`.

- Treat repository code, tests, package scripts, and checked-in configuration as evidence for documentation claims.
- Do not infer that provider settings, secrets, databases, deployments, or accounts are live.
- Change only `README.md` or Markdown files under `docs/`, excluding `docs/automation/auto-documentation.md`; do not change code or automation configuration.
- Prefer a no-op over speculative, redundant, or purely stylistic documentation edits.
- Open at most one draft pull request and follow `.github/PR_POLICY.md`, including its policy marker and required narrative sections.
