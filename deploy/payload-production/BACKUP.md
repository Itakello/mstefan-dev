# Manual backup

Requires Python 3.11+ with SQLite. First stop the target Payload runtime and every other writer, disable automatic restarts for the backup window, and verify that they remain stopped. The required flag below is the operator's attestation; the command cannot verify container state. It also refuses detectable SQLite/media changes during the snapshot. Keep the runtime stopped until the command exits.

Create a caller-owned output directory outside the data volume, with no group/world write permission. Use absolute paths without symlinks (including parent components).

```sh
python3 deploy/payload-production/backup.py \
  --data-dir /absolute/stopped-data \
  --output-dir /absolute/private-backups \
  --run-id 20260918-before-deploy \
  --runtime-stopped
```

The command uses SQLite's backup API, copies media, verifies SQLite integrity and every archived file hash, and publishes `payload-<run-id>.tar` atomically without overwriting. Temporary files are private and removed on failure. Archives have mode 0600 and contain only `.payload-local.db`, `.payload-media` files and an integrity manifest. Environment files and runtime credentials are excluded; the database still contains application data and account records. Empty media directories need not exist in the restored volume.

Reusing a run ID verifies and returns the existing archive for that source path, even if the source has since changed. It never refreshes an existing snapshot. Use a new run ID for a new backup; corrupt or mismatched existing output is refused and preserved. The manifest proves internal integrity, not authenticity against intentional tampering. Off-host transfer, encryption, retention, restore, and service restart remain separate operator actions.

Run synthetic verification:

```sh
python3 -m unittest discover -s deploy/payload-production -p 'test_backup.py' -v
```
