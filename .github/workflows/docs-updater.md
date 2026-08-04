---
name: Documentation freshness pilot
description: Review repository documentation against current code and propose a bounded draft pull request.
on:
  workflow_dispatch:
  skip-if-match: 'is:pr is:open in:title "[docs-auto]"'
  stop-after: "2026-09-03"

permissions:
  contents: read
  pull-requests: read

engine: codex
model: gpt-5.6-terra?effort=medium

network: defaults

tools:
  edit:
  bash: true

timeout-minutes: 20
max-turns: 12
max-ai-credits: 200

safe-outputs:
  report-failure-as-issue: false
  missing-tool: false
  missing-data: false
  report-incomplete: false
  noop:
    report-as-issue: false
  create-pull-request:
    github-token: ${{ secrets.GH_AW_CI_TRIGGER_TOKEN }}
    title-prefix: "[docs-auto] "
    branch-prefix: "docs/"
    draft: true
    max: 1
    expires: 7d
    fallback-as-issue: false
    excluded-files:
      - docs/automation/auto-documentation.md
    allowed-files:
      - README.md
      - docs/**
    protected-files:
      policy: blocked
      exclude:
        - README.md
    max-patch-files: 8
    max-patch-size: 512
---

# Refresh repository documentation

Compare the checked-out repository's current behavior with its human-facing documentation.

## Inspect

1. Read `AGENTS.md`, `.github/PR_POLICY.md`, `README.md`, and `docs/automation/auto-documentation.md` first.
2. Inspect the current code, tests, package scripts, public routes, environment-variable usage, and GitHub workflows as evidence.
3. Compare that evidence with claims in `README.md` and existing files under `docs/`.

Do not use web research or infer live provider, deployment, secret, database, or account state. Configuration in the repository proves only intended configuration, not that a provider change is enabled or deployed.

## Decide

- If the documentation already matches the repository, make no edits and call the `noop` tool with a short evidence-based explanation. Do not open a pull request.
- Update documentation only when a claim is materially outdated, missing, or misleading for a maintainer or user.
- Keep the existing structure and voice. Do not create broad architecture prose, speculative roadmaps, changelogs, ADRs, or comments that merely restate code.
- If a fact cannot be verified from repository evidence, leave it unchanged or remove the unsupported claim. Explain material uncertainty in the pull request body.

## Allowed changes

You may edit only:

- `README.md`
- Markdown files under `docs/`, except `docs/automation/auto-documentation.md`

Do not edit source code, tests, generated files, dependency manifests, lockfiles, `AGENTS.md`, `.github/`, `docs/automation/auto-documentation.md`, or provider configuration. The safe-output policy independently blocks or strips those files.

Before proposing changes, run `git diff --check`. Do not install dependencies. Run additional documentation-only checks only when they are already available without installation.

## Pull request

If and only if documentation changed, open one draft pull request with a concise title describing the corrected documentation. Branch naming is enforced by the safe-output policy.

Every successful run must call exactly one safe-output tool: `create_pull_request` when documentation changed, or `noop` when it did not. Do not call both.

The pull request body must follow the repository policy exactly and contain substantive prose in every section:

```markdown
<!-- itakello-policy: pr-template@2 -->

## 🎯 Intent

Explain the verified documentation drift that caused the change.

## ✨ Outcome

Describe what a maintainer or user can now understand correctly, naming the updated documentation.

## 🛡️ Boundaries and risk

State that source code and provider state were not changed. Name any fact that still needs human verification.

## ✅ Verification

List the repository evidence inspected and the exact checks run, including `git diff --check`.
```

Replace the instructional sentences with evidence from this run. Do not leave placeholders or empty sections.
