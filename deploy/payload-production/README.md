# Private Payload production runtime

Build with `docker build .`. The root Dockerfile is also the build recipe for native Git deployments in Openship. Run one instance with container port 3000 behind the existing private deployment route. No public cutover is included.

For the private deployment set `SITE_DEPLOYMENT=private`. Without that explicit setting, production requires valid Notion/GitHub publication sources and fails closed. Provide `PAYLOAD_SECRET` from the approved secret store (at least 32 characters), and mount persistent storage writable by UID 1000 at `/data`. Keep the same secret across restarts. The volume contains `.payload-local.db` and `.payload-media/`; back up and restore them together using a SQLite-consistent database copy. Do not mount the running preview's volume into this runtime.

Do not copy `VERCEL` or `VERCEL_ENV` into the self-hosted runtime. Vercel deployment markers retain their existing precedence; the private flag does not relax publication checks for a Vercel production deployment.

Use Openship’s `loopback-port` routing strategy so deployment stops the old runtime before starting its replacement. `container-ip` can overlap two containers on the same SQLite volume and must not be used for automatic deployment. Verify the native edge and retained-image restore plan before enabling automatic deployments. Application rollback does not reverse database migrations; only deploy migrations compatible with the retained image, or restore a verified database/media backup during a controlled outage.

The container runs committed migrations before starting Next.js in production mode. New databases initialize bilingual page copy; existing published content and drafts are preserved. Project and Stack publication remain in Notion. The initial private deployment may omit those integrations; it displays their unconfigured state. Public deployment still requires verified Notion/GitHub configuration and publication validation.

For a copy of the existing development preview, stop the target runtime, verify a recoverable backup, and run `pnpm migrate:baseline-preview` once in the production image with the copied volume and secret. This compares all table columns, indexes and foreign keys against a freshly migrated temporary database, rejects schema drift, and only records matching migration history. Then start normally. Never use the interactive development-schema migration prompt against the original preview database.

The admin Publish button publishes only the active language by default; the secondary all-languages action remains explicit. The About photo is shared across languages. Anonymous requests may access only the photo currently referenced by the published About page. Uploaded or replaced photos remain available to authenticated editors.

Administration, Payload APIs, and draft previews are available only through the loopback-bound application port or its private SSH tunnel. The Openship reverse proxy must preserve Host and overwrite X-Real-IP on every request. The presence of X-Real-IP prevents a spoofed loopback Host from granting private access; forwarded host headers never grant access. Public media requests discard CMS credentials and bypass the image optimizer cache so publication changes revoke access. Only signed webhook POST handlers and published media file GET/HEAD requests are exposed under `/api`.

Use the [manual backup procedure](BACKUP.md) while all writers are stopped. Verify a restored copy in an isolated volume before relying on the archive for recovery; same-host archives do not protect against host loss.

Outbound email is explicitly disabled, so password-reset links are never written to application logs. Account recovery must use the existing authenticated admin/approved recovery procedure; email delivery is not configured.

## Verification

Use Node 24 and a free registered local website port, `127.0.0.1:3000`:

- `pnpm test`
- `pnpm exec tsc --noEmit`
- `PAYLOAD_SECRET=build-only-placeholder-not-a-runtime-secret PAYLOAD_DATA_DIR=/tmp/payload-build pnpm build`
- `pnpm test:cms`

CMS tests create disposable databases and an isolated production server, block external provider fetches, exercise the actual admin Publish button, check draft/media privacy, and verify restart persistence. They require installed Playwright Chromium and never use an existing database or account.
