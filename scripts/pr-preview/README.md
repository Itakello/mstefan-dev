# PR previews

The trusted default-branch workflow reconciles same-repository pull requests into separate OpenShip Docker environments. GitHub deployment statuses link to `https://pr-N.preview.mstefan.dev` after the exact PR commit, running container, origin certificate and public HTTPS probe pass. Forks receive no deployment or secrets.

Each PR has its own named `/data` volume for SQLite and uploads, and a Payload signing key derived from the preview-only seed. Production credentials and Notion integrations are not copied. CMS content starts from the application's seed; Projects and Stack remain unconfigured until a separate non-production source is supplied. Public preview links allow GET/HEAD, discard cookies and authorization, and prevent indexing and caching.

Closing a PR cancels unfinished builds, removes its public hostname and stops its application and gateway. Data is retained for reopening; this workflow does not delete volumes.

## Setup and activation

Create an undeployed `mstefan-pr-previews` OpenShip template with the repository Dockerfile, `runtimeMode: docker`, `routeStrategy: loopback-port`, port 3000 and `data:/data`. Set readiness to path `/en/about`, port 3000, timeout 120 seconds and stabilization 30 seconds. Scope the OpenShip token to creating projects and managing the projects it creates, plus `View` access to `Itakello/mstefan-dev` so deployment can read its git source. On token replacement, grant `Deploy & manage` access to the existing preview template, its preview children and their gateway projects. Exclude the production project and unrelated resources.

The Cloudflare `mstefan-pr-previews` Worker uses `edge.mjs`, an initially empty `ACTIVE_PRS` plain-text binding and an `ORIGIN_AUTH_KEY` secret derived from the preview seed. Each PR uses an exact Worker Custom Domain and a proxied origin A record named `preview-origin-pr-N.mstefan.dev`. A separate trusted nginx gateway authenticates the Worker's per-PR credential before reaching the application over a private Docker network. PR code receives no origin credential, and the application has no public domain. The controller verifies the origin certificate, authenticated forwarding and unauthenticated rejection before exposing the preview URL.

Configure Tailscale OIDC trust for issuer `https://token.actions.githubusercontent.com`, subject `repo:Itakello/mstefan-dev:*`, and custom claims:

- `workflow_ref`: `Itakello/mstefan-dev/.github/workflows/pr-previews.yml@refs/heads/master`
- `event_name`: `pull_request_target`

Grant only device core registration under `tag:mstefan-preview-ci`; the network grant permits this tag to reach `100.111.250.54` on `tcp:443`.

Set GitHub variables `MSTEFAN_PREVIEW_TEMPLATE_ID`, `MSTEFAN_PREVIEW_TS_CLIENT_ID` and `MSTEFAN_PREVIEW_TS_AUDIENCE`. Transfer the following secrets from their dedicated 1Password Dev entries through protected transport:

- `MSTEFAN_PREVIEW_OPENSHIP_TOKEN`
- `MSTEFAN_PREVIEW_CLOUDFLARE_TOKEN`
- `MSTEFAN_PREVIEW_PAYLOAD_SECRET` (at least 32 characters)

Leave `MSTEFAN_PR_PREVIEWS_ENABLED` unset or `false` until live deployment, replay, isolation and close/reopen checks pass. Setting it to `false` pauses future workflow runs; existing previews remain active, and PRs closed during the pause require reconciliation before resuming.

Run `node --test scripts/pr-preview/*.test.mjs` for controller and edge checks. Mock tests establish local behavior; they do not prove installed OpenShip compatibility, actual mounts, DNS or certificates. Merging this setup must account for the existing master CI production-deployment trigger before changing the base branch.
