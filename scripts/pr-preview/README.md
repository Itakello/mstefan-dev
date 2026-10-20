# PR previews

The trusted default-branch workflow reconciles same-repository pull requests targeting `master` into separate OpenShip Docker environments. GitHub deployment statuses link to `https://pr-N.preview.mstefan.dev` after the exact PR commit, running container, origin certificate and public HTTPS probe pass. Forks receive no deployment or secrets.

Each PR has its own named `/data` volume for SQLite and uploads, and a Payload signing key derived from the preview-only seed. Production credentials and Notion integrations are not copied. CMS content starts from the application's seed; Projects and Stack remain unconfigured until a separate non-production source is supplied. Public preview links allow GET/HEAD, discard cookies and authorization, and prevent indexing and caching.

Closing a PR or retargeting it away from `master` cancels unfinished builds, removes its public hostname and stops its application and gateway. Application projects and backup metadata are retained. With data expiry disabled, application volumes are retained for reopening. After native backup and restore verification, the separate `MSTEFAN_PR_PREVIEW_DATA_EXPIRY_ENABLED=true` gate enables application-volume expiry after seven closed days. Configure `MSTEFAN_PREVIEW_BACKUP_DESTINATION_ID` with the verified native destination. Every removal requires a completed volume backup, its exact frozen deployment and artifact identity, and a reread protection lock covering 30 days after removal with five minutes of transport padding. Daily replay of an absent volume does not create another backup or extend that lock. Native backup retention removes expired artifacts; do not delete the application project or policy while recovery is retained. Reopening restores a retained recovery point before a fresh deployment; missing or unverifiable recovery proof blocks deployment. A verified expired recovery point permits fresh preview data after the recovery window. The cleanup sweep deletes only stateless gateways after seven closed days, after worker completion, stopped-container proof, a zero-volume deletion preview and another live PR check. It verifies removal of the exact owned origin DNS record before deleting the gateway, so a lost deletion response cannot strand DNS without a discoverable owner. Retargeted open PRs are stopped without retention deletion; open PRs targeting `master` are skipped before mutations.

## Setup and activation

OpenShip's build-status response must expose `completionPending` for terminal deployments, derived from its durable build execution lease. The controller waits for `false` before reusing or publishing a ready release; an absent field fails closed. Older installations need the [build-completion overlay](https://github.com/Itakello/Infra/tree/master/deploy/openship-build-completion) before activation.

Create an undeployed `mstefan-pr-previews` OpenShip template with the repository Dockerfile, `runtimeMode: docker`, `routeStrategy: loopback-port`, port 3000 and `data:/data`. Set readiness to path `/en/about`, port 3000, timeout 120 seconds and stabilization 30 seconds. Scope the OpenShip token to creating projects and managing the projects it creates, plus `View` access to `Itakello/mstefan-dev` so deployment can read its git source. On token replacement, grant `Deploy & manage` access to the existing preview template, its preview children and their gateway projects. Exclude the production project and unrelated resources.

The Cloudflare `mstefan-pr-previews` Worker uses `edge.mjs`, an initially empty `ACTIVE_PRS` plain-text binding and an `ORIGIN_AUTH_KEY` secret derived from the preview seed. Each PR uses an exact Worker Custom Domain and a proxied origin A record named `preview-origin-pr-N.mstefan.dev`. A separate trusted nginx gateway authenticates the Worker's per-PR credential before reaching the application over a private Docker network. PR code receives no origin credential, and the application has no public domain. Before requesting a certificate, the controller waits for positive public DNS evidence from Google and Cloudflare; certificate failure still withdraws the preview. It verifies the origin certificate, authenticated forwarding and unauthenticated rejection before exposing the preview URL.

Configure an active GitHub Actions event policy for `.github/workflows/pr-previews.yml` only, allowing `pull_request_target`, `schedule` and `workflow_dispatch`. The sweep runs daily at 03:23 UTC or manually on protected `master`, shares the event concurrency queue, and invokes only the cleanup path. It examines at most 1,000 scoped projects and 100 PR targets, stops admitting provider calls after 20 minutes, continues after target failures, and fails the run visibly with failed PR numbers. The job has a separate 40-minute hard limit. The privileged runner checks out protected `master`; PR application code is built by OpenShip. Events for other PR bases are retained for cleanup, while preview creation requires a live `master` base.

Configure Tailscale OIDC trust for issuer `https://token.actions.githubusercontent.com`, subject `repo:Itakello/mstefan-dev:*`, and custom claims:

- `workflow_ref`: `Itakello/mstefan-dev/.github/workflows/pr-previews.yml@refs/heads/master`
- `event_name`: `pull_request_target`

Keep that PR identity unchanged. Create two separate OIDC clients for the sweep, each using the same issuer and exact `workflow_ref` above, exact subject `repo:Itakello/mstefan-dev:ref:refs/heads/master`, and one literal `event_name` claim:

| Event | Client ID variable | Audience variable |
| --- | --- | --- |
| `schedule` | `MSTEFAN_PREVIEW_SWEEP_TS_CLIENT_ID` | `MSTEFAN_PREVIEW_SWEEP_TS_AUDIENCE` |
| `workflow_dispatch` | `MSTEFAN_PREVIEW_MANUAL_TS_CLIENT_ID` | `MSTEFAN_PREVIEW_MANUAL_TS_AUDIENCE` |

These public OIDC IDs and audiences are GitHub variables, not secrets. Each client's `auth_keys` scope permits only device core registration with `tag:mstefan-preview-ci`; do not widen the PR client's event claim or use an event wildcard.

Grant only device core registration under `tag:mstefan-preview-ci`; the network grant permits this tag to reach `100.111.250.54` on `tcp:443`.

Set GitHub variables `MSTEFAN_PREVIEW_TEMPLATE_ID`, `MSTEFAN_PREVIEW_TS_CLIENT_ID` and `MSTEFAN_PREVIEW_TS_AUDIENCE`. Transfer the following secrets from their dedicated 1Password Dev entries through protected transport:

- `MSTEFAN_PREVIEW_OPENSHIP_TOKEN`
- `MSTEFAN_PREVIEW_CLOUDFLARE_TOKEN`
- `MSTEFAN_PREVIEW_PAYLOAD_SECRET` (at least 32 characters)

Leave `MSTEFAN_PR_PREVIEWS_ENABLED` unset or `false` until live deployment, replay, isolation and close/reopen checks pass. Setting it to `false` pauses preview creation; existing open previews remain active. Set the independent `MSTEFAN_PR_PREVIEW_CLEANUP_ENABLED=true` only after cleanup compatibility and trust checks pass to enable close/retarget event cleanup and the scheduled/manual sweep even while creation is paused. Leave creation, cleanup and data expiry disabled during credential rotation. Keep data expiry false until the provider capability, destination, canary restore and least-privilege controller access have been verified; runtime and stateless cleanup remain available independently. Scheduled/manual runners also require the corresponding Tailscale event trust before activation.

Daily cleanup continues until disabled. Seven days is a review checkpoint, not an enforced expiry; the expected first-week volume is seven scheduled runs plus two attended manual trials, with no model spending or automatic workflow retries. The controller admits provider calls for at most 20 minutes; the GitHub job has a 40-minute hard limit. Failed targets produce a failed GitHub Actions run with PR numbers in its log. Pause cleanup with `MSTEFAN_PR_PREVIEW_CLEANUP_ENABLED=false`; this prevents new cleanup jobs, so finish or cancel any already running or queued jobs when a full stop is needed. Review the first week's failures and bounds before extending observation.

## Preview seed rotation

Changing `MSTEFAN_PREVIEW_PAYLOAD_SECRET` is coordinated maintenance with preview downtime. It changes every application's Payload key and every gateway credential, including the shared Worker signing key. Do not rotate it during ordinary per-PR reconciliation: changing the Worker key for one PR would invalidate the other active gateways.

1. Set both `MSTEFAN_PR_PREVIEWS_ENABLED=false` and `MSTEFAN_PR_PREVIEW_CLEANUP_ENABLED=false`, finish or cancel every running and queued preview job, and stop attended controller runs. Record the active PR numbers and all existing preview application/gateway pairs. Set the Worker's entire `ACTIVE_PRS` binding to an empty string, preserve its other binding, and verify every previously active public URL returns 404 before changing any key.
2. Rotate the seed in its dedicated 1Password entry and GitHub secret through protected transport. Keep old-seed jobs and controller runs stopped throughout the maintenance.
3. For each still-open PR, derive its new Payload key with the trusted controller's `payloadSecret` helper, update only that application's preview `PAYLOAD_SECRET`, and deploy a fresh native OpenShip release at its current PR commit. Verify the new release is active and healthy. Reconciliation alone may reuse an already-ready application at the same commit, so it does not prove the new key reached that container.
4. Run the trusted controller sequentially for each affected PR using the new seed. It replaces that gateway's saved credential, deploys a fresh gateway release, and verifies authenticated forwarding and unauthenticated rejection before adding the PR back to `ACTIVE_PRS`. Reconcile closed PRs through their cleanup path. A failed PR stays withdrawn; do not restore the old allowlist wholesale.
5. Verify every restored public URL and the corresponding gateway rejection checks, then re-enable future workflow runs. Rotation is complete only when all affected application and gateway runtimes use the new credentials and no old-seed run can publish settings again.

Run `node --test scripts/pr-preview/*.test.mjs` for controller and edge checks. Mock tests establish local behavior; they do not prove installed OpenShip compatibility, actual mounts, DNS or certificates. Merging this setup must account for the existing master CI production-deployment trigger before changing the base branch.
