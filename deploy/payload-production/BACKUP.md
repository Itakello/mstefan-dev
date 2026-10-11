# Manual backup

Requires Python 3.11+ with SQLite. First stop the target Payload runtime and every other writer, disable automatic restarts for the backup window, and verify that they remain stopped. The required flag below is the operator's attestation; the command cannot verify container state. It also refuses detectable SQLite/upload changes during the snapshot. Keep the runtime stopped until the command exits.

Create a caller-owned output directory outside the data volume, with no group/world write permission. Use absolute paths without symlinks (including parent components).

```sh
python3 deploy/payload-production/backup.py \
  --data-dir /absolute/stopped-data \
  --output-dir /absolute/private-backups \
  --run-id 20260918-before-deploy \
  --runtime-stopped
```

The command uses SQLite's backup API, copies media and documents, verifies SQLite integrity and every archived file hash, and publishes `payload-<run-id>.tar` atomically without overwriting. Temporary files are private and removed on failure. Archives have mode 0600 and contain only `.payload-local.db`, `.payload-media` and `.payload-documents` files, and an integrity manifest. Environment files and runtime credentials are excluded; the database still contains application data and account records. Empty upload directories need not exist in the restored volume.

Reusing a run ID verifies and returns the existing archive for that source path, even if the source has since changed. It never refreshes an existing snapshot. Use a new run ID for a new backup; corrupt or mismatched existing output is refused and preserved. The manifest proves internal integrity, not authenticity against intentional tampering. Off-host transfer, encryption, retention, restore, and service restart remain separate operator actions.

Run synthetic verification:

```sh
python3 -m unittest discover -s deploy/payload-production -p 'test_backup.py' -v
```

## Prepare an on-demand staging refresh

See [Website environments](ENVIRONMENTS.md) for the environment boundaries, Notion reconciliation, deployment cutover and recovery procedure.

`staging_restore.py` prepares a new offline volume; it does not switch deployments. Stop all existing staging writers and checkpoint its SQLite database first. Nonempty WAL/SHM/journal sidecars are refused. Create a new empty caller-owned target directory outside production, existing staging, and backup directories, without group/world write permission. Use absolute paths without symlinks.

```sh
python3 deploy/payload-production/staging_restore.py \
  --archive /absolute/private-backups/payload-20260918-before-deploy.tar \
  --run-id 20260918-before-deploy \
  --production-data-dir /absolute/stopped-data \
  --staging-db /absolute/existing-staging/.payload-local.db \
  --target-dir /absolute/new-staging-volume \
  --staging-stopped
```

The production path must match the archive's original source path and is used only for identity and overlap checks. The command verifies the backup manifest/hashes, copies production content and uploads, and replaces accounts with existing staging identities and password credentials. It removes sessions, password-reset/login-lock state, preferences, and document locks; production credentials are also removed from freed SQLite pages. Existing staging, production data, and the archive remain unchanged. Account schemas must match the supported migrations; unfamiliar user relationships, missing staging password credentials, or failed SQLite/FK checks refuse preparation. Every refresh requires a fresh empty target; switching the deployment and validating staging sign-in/content remain separate operator steps.

```sh
python3 -m unittest discover -s deploy/payload-production -p 'test_staging_restore.py' -v
```
