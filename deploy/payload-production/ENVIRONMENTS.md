# Website environments

| Environment | Entry point | Data and editing |
| --- | --- | --- |
| Sandbox | https://sandbox.mstefan.dev | Synthetic CMS content, uploads, Projects and Stack; freely editable. |
| Staging | https://staging.mstefan.dev | Production-derived CMS content/uploads and copied website Projects/Stack; freely editable until the next refresh. |
| Production | https://www.mstefan.dev | Published site and canonical data. |

Sandbox and Staging require tailnet access, including CMS access at `/admin`. Normal TLS, private CMS entry points, dedicated sign-in and upload cleanup were verified on 2026-10-11. Production's public endpoint does not expose the CMS. Private routing must remain bound to the tailnet address; a friendly DNS name alone does not establish isolation.

Each environment has separate Payload data storage, signing credentials and Notion access. Sandbox and Staging use dedicated CMS accounts saved in 1Password as `mstefan.dev Sandbox CMS` and `mstefan.dev Staging CMS`. Their Notion connections have read-only access to their own two databases. Edit Projects and Stack in the corresponding Notion copies, using the attended operator's authorized access, rather than granting the website a writer credential.

OpenShip identifies Staging as project `mstefan-payload-preview`, with the existing `Review preview` label and `preview` scope. Sandbox is project `mstefan-payload-sandbox`, with `development` scope. Use these exact scopes when inspecting or changing environment variables; they are distinct from the human-facing environment names.

## Notion data boundary

| Environment | Projects database | Stack database |
| --- | --- | --- |
| Production | `24c05536223f80a09016d368aa7e2cb8` | `c187209785eb4783bbd6d9e2e0ab9bd4` |
| Staging | `3191aa9d08224689a2d5156d7249cfcb` | `ad0c8bc959e84d56a6b5c4d212d00e29` |
| Sandbox | `17d6145bed9e4172951546376113ed90` | `002d748a8b9543919bdbff4c4dc02a10` |

Staging copies only the website-consumed properties. Projects use `Name`, `Status`, `Type`, `Summary`, `Summary IT`, `Short summary`, `Short summary IT`, `Publication`, `Publication IT`, `URL`, `Website URL`, `Preview URLs`, `Paper URL`, `Slides URL`, `Tags`, `Language` and `Year`. Copy only production Projects with `Status: Added`. Stack uses `Name`, `Category`, `Icon key` and `Proficiency`. Match property types and relevant select options; optional source properties need copying only when present.

Do not copy canonical private page bodies, relations, production account credentials or environment secrets. The initial snapshot contained 10 published Projects and 56 Stack rows; fetch fresh source rows for every refresh rather than treating those counts as permanent expectations. Sandbox initially contains two synthetic Projects and three synthetic Stack rows and is not a production refresh target.

## Attended Staging refresh

A refresh replaces Staging experiments with a fresh production snapshot. It is explicitly requested and attended; no scheduler keeps Staging synchronized. CMS and Notion are separate stores, so keep Staging stopped until both are reconciled and verified.

### Supported command

Run on the verified Docker/OpenShip host as root, from a trusted checkout containing both `deploy/payload-production` and `deploy/event`. The command reuses the active Staging image; it does not pull source or rebuild. Keep other attended deployment/host writers and Notion editors out of the refresh window. It holds the production event controller's existing lock for the whole operation; that lock does not control arbitrary host processes or provider-console operators.

```sh
python3 deploy/payload-production/staging_refresh.py plan --credentials-file /run/mstefan-staging-refresh/credentials.json
python3 deploy/payload-production/staging_refresh.py apply --credentials-file /run/mstefan-staging-refresh/credentials.json
```

`plan` performs reads without signing in, stopping runtimes, creating a snapshot, checkpointing SQLite or changing Notion. `apply` generates a unique run ID, snapshots production during a brief stop, restarts and checks production, prepares a new isolated volume, reconciles Notion, cuts over Staging and verifies readiness. Its private journal and recovery archive remain under `/var/backups/mstefan-payload/staging-refresh/<run-id>`. A reported `ready` includes dedicated sign-in, both locales' globals/pages, Projects and Stack rendering, upload hashes, the retained image/commit and sole writer. It leaves recovery volumes and Notion Trash intact.

Prepare the credential bundle through protected 1Password transport in a root-owned mode-0700 temporary directory; the JSON file must have mode 0600 and exactly these keys:

- `openship`: project/deployment reads for Production and Staging, plus only Staging mount update and native refresh where installed permission granularity permits.
- `notion_source`: read-only access to the two production source databases.
- `notion_target`: a separate attended operator connection with read/insert/update content access to only the two Staging databases, including Trash/restore. Do not broaden the website's read-only connection.
- `staging_email` and `staging_password`: the dedicated Staging CMS login from 1Password.

Credentials are execution prerequisites, not supplied by the repository. Do not reuse the revoked setup token, place values in arguments/logs, or save a broad provider token as a workaround. Remove the exact temporary bundle after the attended command finishes. `plan` cannot prove write capability without a mutation; missing write access fails the apply and enters recovery.

Preflight compares migration/dependency/startup Git identities and WAL-aware SQLite schema/applied migration signatures. Migration, lockfile or startup changes refuse refresh until Staging is aligned and verified. Other protected configuration differences require an independent compatibility review in root-owned mode-0600 `/etc/mstefan-staging-refresh/compatibility.json`. The receipt contains exact `production` and `staging` objects with `commit` and `image`, the full sorted `reviewed_paths`, `standards: clean`, `spec: clean`, and Unix `expires_at` within seven days. A receipt only clears reviewed source differences; it never waives the SQLite or restore integrity checks. Labels/test-only changes can be reviewed without rebuilding Staging. Unfamiliar hooks, validation or schema-generating changes cannot be inferred safe from equal database schemas.

Failures attempt bounded recovery before returning nonzero. An interrupted or uncertain native submission is never blindly repeated; Staging can remain stopped with `recovery_required`. Once its exact provider outcome is terminal and identified, recover the retained run:

```sh
python3 deploy/payload-production/staging_refresh.py rollback --run-id <exact-reported-run-id> --credentials-file /run/mstefan-staging-refresh/credentials.json
```

An unknown Notion creation result or native submission with no returned ID requires operator reconciliation. Inspect the exact provider result and protected journal; do not erase the pending intent or repost to force progress. `rollback` recovers unfinished runs, not later experiments after a successful refresh. The following steps describe the underlying operation and attended recovery boundaries.

1. Verify the exact production and Staging deployment containers, their mounted volumes, all writers and current restart policies. Preserve Staging's current volume, dedicated accounts, deployment configuration and copied Notion property values/page IDs for recovery. Refuse ambiguous identities, shared volumes or multiple writers.
2. Stop every production writer, temporarily disable automatic restarts and verify they remain stopped. Run [the backup command](BACKUP.md#manual-backup) with a **new run ID** and a private output directory. Verify success, then restore the recorded production restart policies and restart production. Confirm the public site works before continuing. An existing run ID returns its old archive rather than taking a fresh snapshot.
3. Stop every Staging writer and disable automatic restarts. Checkpoint its SQLite WAL with `PRAGMA wal_checkpoint(TRUNCATE)` while stopped; verify completion and no nonempty WAL/SHM/journal sidecars. Create a fresh empty target volume, separate from production, existing Staging and the archive. Prepare it using the supported command below; the paths and run ID must refer to the verified snapshot and account donor.

   ```sh
   python3 deploy/payload-production/staging_restore.py \
     --archive /absolute/private-backups/payload-20261012-staging-refresh.tar \
     --run-id 20261012-staging-refresh \
     --production-data-dir /absolute/production-data \
     --staging-db /absolute/stopped-staging-data/.payload-local.db \
     --target-dir /absolute/new-staging-volume \
     --staging-stopped
   ```

   Substitute actual paths and a run ID before executing. Follow [the restore prerequisites](BACKUP.md#prepare-an-on-demand-staging-refresh), including caller ownership and path permissions. The production path identifies the archive's source; restoration does not write production. The helper retains dedicated Staging identities/password credentials, removes production authentication and transient state, and verifies database/upload integrity. Set prepared files' ownership to the verified runtime UID/GID before mounting them.
4. With Staging still stopped, fetch all current published production Projects and all Stack rows through the authorized attended Notion writer. Read complete results, including pagination. Verify unique `Name` values in source and target before matching; stop for ambiguous duplicates. Reconcile the allowed schemas and properties, create missing target rows, replace changed or cleared values, and move only exact stale **Staging** rows to Notion Trash. Retain recoverable Trash and the previous target values/page IDs until validation; never purge Trash or modify source rows. Reread both target datasets and compare full names, property values and counts against this fresh source snapshot.
5. Switch only the Staging project's `/data` mount to the newly prepared volume. Use OpenShip's native deployment refresh to reuse that project's active application image, then verify the resulting commit, mount and sole writer. A data refresh does not require rebuilding or pulling a different code version. Keep the old runtime stopped so it cannot reclaim the port or write its retained volume.
6. Verify Staging's dedicated sign-in, published Home/About/Career in both locales, copied uploads and rendered Projects/Stack. Exercise a reversible edit and a uniquely identified test upload; remove only that exact verified test artifact. Verify saved scoped Notion access to its own two databases and denial for Production and Sandbox; inspect the masked deployment environment, separate volumes/credentials, private HTTPS access, and continued public production health/CMS denial. Restore the intended restart policy for the new active runtime only after the mount and identity checks pass.

If preparation fails before cutover, preserve its failure evidence, restore the recorded Staging configuration/restart policy and resume the old runtime. After cutover, stop the new sole writer before switching back to the retained old volume/image. Restore changed Notion values from the captured target properties and recover the exact trashed target pages when rolling back the dataset. Verify sign-in, data and production health again. Do not delete recovery volumes or snapshots during a failed refresh.

Backups contain production account records and remain private even though the prepared Staging database removes those credentials. Off-host backup transfer, encryption, retention and a full disaster-recovery drill are separate operations; this procedure establishes an attended environment refresh.
