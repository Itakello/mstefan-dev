# Guarded mstefan.dev event deployment

This prepares event deployment of `Itakello/mstefan-dev` master to existing Openship project `proj_w1kqcgR7eY2EZhht`. It is disabled until repository variable `MSTEFAN_EVENT_DEPLOY_ENABLED=true`. Host installation, credentials, installed API contract, single-writer and recovery proof remain activation prerequisites; checked-in files do not establish those live facts.

A successful push `CI` workflow event passes its exact SHA and run ID through a dedicated forced-command SSH account. The host independently verifies current master, the exact completed push workflow, `project-technologies` and `verify` success, and known PR-only jobs skipped with matching identity. The controller rereads current master after final activation and active-baseline checks, immediately before writing the durable submission marker and POST. Superseded events skip successfully before submission, allowing the latest passing event to proceed. After submission the controller finishes observing the exact in-flight release. GitHub concurrency serializes jobs; the host uses a nonblocking exclusive flock. The controller submits only `POST http://127.0.0.1:4000/api/deployments` with that project, `branch=master`, exact `commitSha` and `environment=production`. No environment edits or application-data writes are made by the controller. Native deployment runs the image's existing startup; it must preserve the existing volume and stop the old SQLite writer first.

The active baseline and candidate recursive Git tree/blob identities must match for migrations, Payload configuration/runtime, collection/global/schema directories, dependencies/lockfile, Dockerfile, `.dockerignore`, TypeScript/Next build configuration and startup configuration. `lib/i18n/copy.ts` and locale configuration are included because Payload derives localized field names from their object keys. Changes to these protected files block for attended compatibility and restore proof. Runtime documentation and backup tests do not block. This conservative gate does not certify arbitrary application changes as migration-compatible; any new schema/startup path must enter the protected set before use.

After deployment, provider record/build status and active deployment ID/commit must match. Read-only GETs to exact `https://www.mstefan.dev` English/Italian Home, Projects and About must return 200. Admin, users, draft/version APIs, GraphQL and preview probes must return 404. Redirects are rejected on these exact paths. These probes establish route status/privacy and provider commit metadata; they do not attest the public HTML's build SHA. The controller also requires one running RW mount of the approved named volume, belonging to the exact active deployment container, before submission and during smoke. Smoke and the probe must be proven on the installed host before activation.

## Host installation and activation proof

Use protected 1Password transport before creating or transferring credentials. Install root-owned `controller.py`, `release_observations.py`, `launch.py` and `volume_probe.py` in `/opt/mstefan-event-deploy`, `mstefan-event-deploy@.service` in `/etc/systemd/system`, and executable `trigger.py` as `/usr/local/sbin/mstefan-event-deploy-trigger`. Install `trigger.sudoers` root-owned mode 0440 in `/etc/sudoers.d`, and validate with `visudo -cf`. Install `mstefan-event-deploy-probe.socket` and `mstefan-event-deploy-probe@.service` in `/etc/systemd/system`. Reload systemd. Create an unprivileged service account `mstefan-event-deploy` and mode-0700 `/var/lib/mstefan-event-deploy` owned by that account. Enable the probe socket after the service group exists. Its fixed `/run/mstefan-event-deploy-probe.sock` endpoint is root-owned mode 0660, group `mstefan-event-deploy`. No TCP listener, Docker group membership or controller sudo permission is needed. Do not install a timer or a native provider webhook.

The root-owned mode-0600 `/etc/mstefan-event-deploy/controller.env` requires `OPENSHIP_TOKEN`. This public repository can use anonymous read-only GitHub metadata/tree requests; missing `GITHUB_TOKEN` sends no Authorization header, and rate-limit/API errors fail closed. If needed, supply an optional token with read-only Contents/Actions for this repository. Do not copy broad interactive GitHub credentials into this service. Limit Openship access to this project's reads and deployment submission where installed authorization supports it; verify actual installed scope before enabling. Keep credentials out of source, logs and command arguments.

Create a dedicated locked-password account `mstefan-event-deploy-trigger` with no other keys or privileges. Install its dedicated public key with `restrict,command="/usr/local/sbin/mstefan-event-deploy-trigger"`. Its only accepted SSH command is `deploy <40-character SHA> <positive CI run ID>`. The root helper validates the arguments and starts one fixed service template with `systemctl start --wait`; it cannot run arbitrary commands. Verify rejection of shell/forwarding/other commands. Store its private key in 1Password and repository secret `MSTEFAN_DEPLOY_TRIGGER_SSH_KEY`; set `MSTEFAN_DEPLOY_HOST` and `MSTEFAN_DEPLOY_HOST_KEY` only after independent exact host/key verification. Host key format is `ssh-ed25519 <base64>`.

Install a root-owned regular `/etc/mstefan-event-deploy/activation.json` after attended proof. Use mode 0644, or mode 0440 with group `mstefan-event-deploy`, so the service can read it while it has no group/world write permission. This file contains no secrets. It requires:

- `project_id` and `repository` exactly as above; `expires_at` as a future Unix timestamp chosen by the owner. Use an initial seven-day review window, then choose an explicit renewal duration based on the installed proof.
- `installed_api_revision` identifying the inspected installed API and `installed_api_verified=true`, including exact GET project/deployment/build and POST deployment response contracts. Upstream source alone is insufficient. Record `host_mount_namespace` as the exact `mnt:[digits]` value obtained by privileged host inspection of `/proc/1/ns/mnt`; the probe checks its own `/proc/self/ns/mnt` against this root-owned attestation and blocks after any namespace change.
- `native_stop_first_verified=true`, after observing native `loopback-port` stop-before-start and confirming no overlapping writer to the existing SQLite `/data` volume. Preserve runtime secret, media, edge route and volume.
- `retained_image_verified=true` and `isolated_restore_verified=true`, after preserving the exact previous image and verifying SQLite-consistent database/media recovery in an isolated volume. See [backup procedure](../payload-production/BACKUP.md).
- `declared_mounts=["data:/data"]`, `docker_volume="openship-mstefan-payload-data"` and `container_prefix="openship-mstefan-payload-"`, exactly. The controller checks the installed project GET `data` object: exact `id`, `gitOwner=Itakello`, `gitRepo=mstefan-dev`, `gitProvider=github`, `gitBranch=master`, `autoDeploy=false`, `slug=mstefan-payload`, `routeStrategy=loopback-port` and `volumes=["data:/data"]`. Missing, altered or additional declared mounts block submission.

The root probe validates the same non-writable activation file and uses only fixed Docker Unix-socket GETs to inspect the approved volume and enumerate all running, paused and restarting containers. It also reads each container process's bounded `/proc/<pid>/mountinfo` and cgroup, checks the cgroup against the Docker container ID (blocking inaccessible or mismatched process identity), and identifies writable mounts held in that process's mount namespace even after a host bind source is retargeted. It returns only writable users of that storage: IDs, names, status and mount identity. A writer is labeled as the approved volume only when Docker also reports its exact name and source. Direct read-only mounts do not count as writers. A read-only parent bind with an overlapping child mount blocks because recursive children may remain writable; an exact read-only opaque network namespace file is exempt. Extra writers, bind aliases, a wrong active deployment, paused/restarting writer, malformed metadata or changed observations block the controller. The probe requires the root-attested mount namespace of host PID 1; it cannot dereference `/proc/1/ns/mnt` under its no-capability sandbox. It maps bind aliases with `/proc/self/mountinfo` filesystem device/root coordinates and path inode, and includes child mounts exposed through a RW parent. The probe unit omits `PrivateTmp`, `ProtectHome` and `ProtectSystem`, which would hide host aliases in a private mount view; it retains no capabilities, `NoNewPrivileges`, Unix-only access and fixed read-only Docker requests. Stacked mountpoints resolve to their visible child by kernel parent IDs. Host network namespace mounts with an exact `net:[digits]` root, `nsfs` type and `/run/docker/netns/<entry>` mountpoint are opaque: they do not affect unrelated volume checks, and access through or under them blocks. An ambiguous stack fails closed when it intersects the approved volume, a candidate mount source, or a child mount exposed through a writable parent; unrelated stacks do not block the probe. Unresolved checked host paths fail closed. It compares two complete observations to reject visible races, has a ten-second service bound and a 32 KiB output cap, and accepts no request arguments or commands. Docker environment values and response bodies are never emitted. Keep the controller service unprivileged with `NoNewPrivileges=true`; the probe receives no deployment credentials.

This observation does not lock Docker or detect arbitrary host processes writing directly to the volume. Native stop-first proof and exclusion of competing provider/host writers remain required; a race after the final observation cannot be ruled out by a read-only probe. The attestation contains no credentials or copied provider response. Recheck live configuration before each submission; repeat installed-API, stop-first and recovery proof after provider upgrades/configuration changes. Disable native project auto-deploy to avoid a competing deployment source.

## Optional production release observations

`release_observations.py` owns a separate sanitized delivery ledger. Installing it
does not activate capture. After proving the installed controller's production
path, initialize `/var/lib/mstefan-delivery/releases.json` as
`mstefan-event-deploy` with
`python3 /opt/mstefan-event-deploy/release_observations.py init /var/lib/mstefan-delivery/releases.json`, then set
`MSTEFAN_RELEASE_OBSERVATIONS=/var/lib/mstefan-delivery/releases.json` in the
protected controller environment. Initialize at the actual start of attended
coverage; the command records that current time and no earlier deployments. Do
not use an empty ready ledger as evidence that capture was active before the
first verified release. Create the directory owned by `mstefan-event-deploy`
with mode 2750 and a dedicated reader group. The setgid directory makes the
atomically replaced mode-0640 ledger readable by that group; grant group
membership only to the verified aggregate reader, with no write access. The
controller service user remains the sole writer. Preserve the directory and
ledger across controller upgrades and rollback.

With the controller idle, call `register_release_ledger(state, state_path)`
under the configured environment before any deployment. It validates a ready
absolute ledger path and saves that exact path in durable controller state; the
next controller tick performs the same registration if it has not yet happened.
Changing or removing the configured path later blocks the controller and pauses
the old ledger if it is ready, so readers cannot report an empty or stale ready
feed. Before removing the flag, explicitly pause the bound ledger while the
configuration still points to it. Reconcile a pending capture first; a pending
ledger is already unavailable to readers and cannot be paused as ready.

With capture enabled, the ledger must durably enter `pending` before the
production POST. A missing, paused, malformed or unwritable ledger blocks the
POST. Once the exact submitted deployment is confirmed active with its SHA, the
controller saves its deployment ID and observation time, then writes the release
before public smoke. A smoke failure therefore leaves that release counted with
classification `unknown`; an operator may later classify failure and recovery
only from verified incident evidence. A crash after ledger write replays the
same ID and timestamp without adding another release. An unresolved pending
capture blocks the next production POST; reconcile the original deployment and
ledger before clearing it. The controller never backfills previous or manually
submitted deployments. `deployedAt` is the first durable observation of the
confirmed active release, not a provider-reported activation timestamp; a
controller interruption can therefore lengthen measured lead time. GitHub
compare is bounded to 250 main-branch commits;
if it is incomplete or unavailable, lead-time coverage remains unavailable.
The reader and any dashboard must treat pending/paused capture, missing source,
unclassified releases, and absent recovery evidence as Unknown, not zero.

Before enabling, prove a controller-confirmed active production release, a
failed-smoke release, a no-new-POST replay, and a pending-ledger refusal against
the installed paths. `classify`, `enrich`, `pause`, `resume`, and `cancel-pending`
are attended ledger commands; preserve a ledger copy and verify the exact
deployment evidence before reconciling pending capture. Set the environment
flag only after the initializer and reader have been checked. Removing the flag
blocks further deployment and leaves the old ledger paused or pending until
attended reconciliation.

## Manual proof, replay and pause

Run `python3 -m unittest discover -s deploy/event -p 'test_*.py'` and workflow lint before installation. With automation still disabled, use a known current successful master push run and invoke the forced-command entrypoint manually. A fresh state may deploy; only an already-active matching SHA produces a health-checked no-op. Inspect the exact project, commit, deployment ID, active ID, public/private probes, native writer transition and service result. Replay the same SHA/run and verify zero new POSTs. Prove failure/pause and unknown-submission handling safely before enabling; offline tests alone do not establish installed behavior.

A 40-minute controller deadline, 45-minute systemd bound and 50-minute GitHub job bound prevent endless runs. GitHub Actions exposes controller/SSH failures; no Slack/email recipient is added. Expired proof, CI/config/schema mismatch, build failure, timeout or smoke failure pauses durable state and records the failed SHA. No automatic rollback or guessed recovery endpoint is called. Failed SHA replay is refused. A durable `submit_unknown` marker written before POST prevents duplication after a crash/timeout before the returned ID is saved.

Pause future events by setting `MSTEFAN_EVENT_DEPLOY_ENABLED=false`. To stop an active run, identify the exact `mstefan-event-deploy@<SHA>-<run>.service` and stop that unit; preserve state and inspect provider activity, since stopping the observer does not cancel a submitted build. Inspect protected state and provider records before reconciliation. For unknown submission, locate the exact matching native deployment; never clear state and repost without proving whether submission occurred. Recovery remains human attended: establish actual installed restore operations, stop all writers, restore verified database/media/image as necessary, and repeat identity/privacy/health checks. Reconcile state only after proof; do not delete failure evidence to force an unattended retry.
