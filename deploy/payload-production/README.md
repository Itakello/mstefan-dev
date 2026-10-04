# Payload production runtime

Build with `docker build .`. The root Dockerfile is also the build recipe for native Git deployments in Openship. Run one instance with container port 3000 behind the existing loopback-bound deployment route. The public `mstefan.dev` domains use the existing edge configuration; administration and previews remain private. Keep those domains and the persistent volume attached when redeploying the existing project.

For the private deployment set `SITE_DEPLOYMENT=private`. Without that explicit setting, production requires valid Notion/GitHub publication sources and fails closed. Provide `PAYLOAD_SECRET` from the approved secret store (at least 32 characters), and mount persistent storage writable by UID 1000 at `/data`. Keep the same secret across restarts. The volume contains `.payload-local.db`, `.payload-media/`, and `.payload-documents/`; back up and restore them together using a SQLite-consistent database copy. Do not mount the running preview's volume into this runtime.

Do not copy `VERCEL` or `VERCEL_ENV` into the self-hosted runtime. Vercel deployment markers retain their existing precedence; the private flag does not relax publication checks for a Vercel production deployment.

Use Openship’s `loopback-port` routing strategy so deployment stops the old runtime before starting its replacement. `container-ip` can overlap two containers on the same SQLite volume and must not be used for automatic deployment. Verify the native edge and retained-image restore plan before enabling automatic deployments. Application rollback does not reverse database migrations; only deploy migrations compatible with the retained image, or restore a verified database/upload backup during a controlled outage.

The container runs committed migrations before starting Next.js in production mode. New databases initialize bilingual page copy; existing published content and drafts are preserved. Project and Stack publication remain in Notion. The initial private deployment may omit those integrations; it displays their unconfigured state. Public deployment still requires verified Notion/GitHub configuration and publication validation.

For a copy of the existing development preview, stop the target runtime, verify a recoverable backup, and run `pnpm migrate:baseline-preview` once in the production image with the copied volume and secret. This compares all table columns, indexes and foreign keys against a freshly migrated temporary database, rejects schema drift, and only records matching migration history. Then start normally. Never use the interactive development-schema migration prompt against the original preview database.

The admin Publish button publishes only the active language by default; the secondary all-languages action remains explicit. The Career global owns work and education entries, their branch names, descriptions, optional dates, newest-first display order, graph colors, and optional photos and PDF documents; its drafts use the same publishing workflow. About keeps the main profile visible when a selected career entry has neither a summary nor documents. An experience photo appears only with a written summary. The About photo is shared across languages. Anonymous requests may access only photos visible through published About or summary-backed Career content, and PDFs referenced by published Career content, in either language. PDFs do not require a written summary. Uploaded or replaced draft-only photos and PDFs remain available only to authenticated editors.

Administration, Payload APIs, and draft previews are available through the loopback-bound application port or its private SSH tunnel. With `SITE_DEPLOYMENT=private`, the exact tailnet Serve Host `itakello-server.tailacf6a7.ts.net:10000` is also accepted. That route must remain tailnet-only and have no public Openship endpoint. The Openship public reverse proxy must preserve Host and overwrite X-Real-IP on every request; any X-Real-IP denies private access even when Host claims the loopback or tailnet address. X-Forwarded-Host does not grant access. Public media and document file requests discard CMS credentials and use `Cache-Control: no-store` so publication changes revoke access. Only signed webhook POST handlers and published media and document file GET/HEAD requests are exposed under `/api`.

Use the [manual backup procedure](BACKUP.md) while all writers are stopped. Verify a restored copy in an isolated volume before relying on the archive for recovery; same-host archives do not protect against host loss.

Outbound email is explicitly disabled, so password-reset links are never written to application logs. Account recovery must use the existing authenticated admin/approved recovery procedure; email delivery is not configured.

## Website analytics

Set `POSTHOG_PROJECT_TOKEN` in the runtime environment to enable PostHog page views on the public `mstefan.dev` and `www.mstefan.dev` localized routes and `page_not_found` counts on visitor 404 pages, including bare and unsupported-locale links. Missing-page events contain only a fixed locale-specific 404 marker and required cookieless ingestion fields, never the missing path or referrer. The token is passed from the dynamic public layout and 404 renderer, so changing it requires a runtime restart rather than an image rebuild. Enable stateless Cookieless server hash mode in the EU PostHog project before deployment. Without the token, analytics stays disabled.

Analytics respects Do Not Track, excludes previews and private hosts, and removes query strings, fragments, campaign parameters, and referrer paths before delivery. It uses no analytics cookies or browser storage, person profiles, interaction autocapture, or session recordings. [Cookieless measurement](https://posthog.com/tutorials/cookieless-tracking) cannot recognize returning visitors across days and does not provide IP-based location data.

## Verification

Use Node 24 and a free registered local website port, `127.0.0.1:3000`:

- `pnpm test`
- `pnpm exec tsc --noEmit`
- `PAYLOAD_SECRET=build-only-placeholder-not-a-runtime-secret PAYLOAD_DATA_DIR=/tmp/payload-build pnpm build`
- `pnpm test:cms`

CMS tests create disposable databases and an isolated production server, block external provider fetches, exercise the actual admin Publish button, check draft/media privacy, and verify restart persistence. They require installed Playwright Chromium and never use an existing database or account.
