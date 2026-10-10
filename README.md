## mstefan.dev — Minimal, fast portfolio

Next.js 16 App Router portfolio with TypeScript, Tailwind CSS, MDX support, and an approval-gated Notion + GitHub project catalog.

- **Live**: `https://mstefan.dev`

### Features
- **Fast, minimal UI** with dark mode toggle and a single accent color.
- **Projects** page publishes approved Notion entries only and fails closed when that source is unavailable.
- **MDX** support for content when you need it.
- **SEO ready**: Open Graph/Twitter metadata and automatic sitemap/robots generation.
- **Utility scripts** to preview missing Notion rows and generate evidence-grounded repository proposals for review.

## Tech stack
- **Next.js 16 (App Router)**
- **TypeScript**
- **Tailwind CSS** (+ typography)
- **MDX** via `@next/mdx`
- **lucide-react** icons
- **Notion SDK** (optional)
- **next-sitemap** for sitemap/robots

## Requirements
- Node.js 20.9+ (required by the locked Next.js version).
- pnpm 10.14.0, as pinned in `package.json`.
- Codex CLI `0.146.0` for `extract:repository-technologies`. Install the validated version with `npm install -g @openai/codex@0.146.0`, authenticate with `codex login` (or `printenv OPENAI_API_KEY | codex login --with-api-key`), then confirm both access and the supported version with `codex login status` and `codex --version`.

## Quick start
```bash
pnpm install --frozen-lockfile
pnpm dev
# open http://127.0.0.1:3000
```

## Configure and personalize
- **Site metadata**: `app/[locale]/layout.tsx` (title, description, OG images, icons).
- **Header name + nav**: `components/Header.tsx`.
- **Accent color**: `app/globals.css`
  ```css
  :root { --accent: 350 89% 56%; }
  ```
- **Home content**: `app/[locale]/page.tsx`.
- **About**: `app/[locale]/about/page.tsx`.
- **Contact links**: `components/Footer.tsx`.

If you fork this repo, also update the hardcoded GitHub username used for repo fetching:
- `lib/github.ts`: `export const GITHUB_USER = "Itakello"`

## Environment variables
These are optional unless you use the Notion and repository proposal scripts.

- `NOTION_TOKEN`: Notion integration token
- `NOTION_DATABASE_ID`: Target database ID
- `NOTION_STACK_DATABASE_ID`: Stack database ID used by the Home toolkit and project technology icons
- `NOTION_PROJECTS_DATA_SOURCE_ID`: Projects data source ID emitted in Notion webhook events
- `NOTION_STACK_DATA_SOURCE_ID`: Stack data source ID emitted in Notion webhook events
- `NOTION_WEBHOOK_BOOTSTRAP_PUBLIC_KEY`: base64-encoded RSA public key used to capture the one-time webhook verification token without logging plaintext
- `NOTION_WEBHOOK_VERIFICATION_TOKEN`: signing token issued while verifying the Notion publication webhook
- `GITHUB_TOKEN` (optional): increases GitHub API rate limit for server-side fetching
- `GITHUB_USER` (optional for scripts): defaults to `Itakello`

Notion database expected properties (create these columns):
- `Name` (title)
- `Type` (select, optional: Website, App, Tool, Research; absent or unselected types are omitted, other values fail publication)
- `URL` (url)
- `Website URL` (url, optional public website; supplies Work visit links and screenshot targets)
- `Preview URLs` (rich_text, optional newline-separated additional full HTTPS URLs on the same origin as `Website URL`; unique normalized URLs, no credentials or fragments, at most 10 pages including the homepage)
- `Paper URL` / `Slides URL` (url, optional HTTPS research resources; blank values are omitted, nonblank invalid or credential-bearing URLs fail publication)
- `Publication` / `Publication IT` (rich_text, optional publication credit in each locale; no translation fallback)
- `Summary` (rich_text, required English long summary)
- `Summary IT` (rich_text, required Italian long summary)
- `Short summary` (rich_text, optional English short summary)
- `Short summary IT` (rich_text, optional Italian short summary)
- `Tags` (multi_select)
- `Language` (multi_select)
- `Year` (number)
- `Status` (status: "To Add", "Added", "Removed")

Work displays static screenshots with a page selector when `Preview URLs` provides additional pages and desktop/mobile switching; visitors use the separate Visit website link to interact with a site. Targets come from approved Notion `Website URL` and `Preview URLs` values. Production images are served from `https://previews.mstefan.dev`; seed and verify that store before deploying. Private development and browser fixtures use checked-in images. Captures request dark mode (light-only sites keep their own appearance) at 1280 × 800 and 390 × 844, with English/Italian routes for mstefan.dev and The Karakal Times. Missing images show an unavailable message.

Run `pnpm exec playwright install chromium` once, then `pnpm capture:website-previews` with the Notion environment configured. Explicit HTTPS URL arguments capture only those pages. The default output is `public/website-previews/`; `WEBSITE_PREVIEW_OUTPUT_DIR` selects a staging directory. Capture failures preserve the previous file, remove temporary files, and fail the command. The scheduled runner rejects private TCP and UDP destinations at the firewall, including DNS rebinding destinations, except DNS to its configured resolvers and systemd upstream resolvers. Local capture additionally filters HTTP requests and disables WebSockets; its DNS check alone is not a network isolation boundary. Capture credentials are excluded from the browser process environment. If Karakal’s Vercel protection challenges automation, store its dedicated project automation credential as `KARAKAL_PREVIEW_BYPASS_SECRET` in GitHub Actions. Capture sends it as an HTTP header only to `https://www.thekarakaltimes.com` and `https://thekarakaltimes.com`, checking every redirect hop; other origins never receive it. Keep the credential in 1Password and remove its GitHub secret and revoke it in Vercel when retiring the capture integration.

`Refresh website previews` runs every Monday at 04:17 UTC when the repository variable `WEBSITE_PREVIEW_REFRESH_ENABLED` is `true`. Manual dispatch defaults to capture-only; selecting Publish uploads successful captures. The job reads the existing Notion secrets and uses bucket-scoped `WEBSITE_PREVIEW_ACCESS_KEY_ID` and `WEBSITE_PREVIEW_SECRET_ACCESS_KEY` for the dedicated `mstefan-website-previews` R2 bucket. All captures must succeed before upload starts; uploads replace the same image keys without committing binaries or deploying the website. Each image is replaced independently: an interrupted upload can leave a mix of capture dates, with prior images retained for keys not uploaded. Failed runs are visible in GitHub Actions and do not retry automatically. Capture evidence is retained for seven days.

The refresh uses no model, allows at most 100 pages per run and 2 MB per image, serializes overlapping runs, and stops after 30 minutes. Initial budget: one scheduled run plus two manual verification runs in the first week (at most 90 job minutes). Disable the repository variable or workflow to pause; capture-only dispatch remains available for diagnosis. Review failures and R2 usage after the first scheduled run before increasing these bounds. R2 storage/request charges above its free allowance are separate from GitHub Actions usage.

Paper and slides URLs are rendered as PDFs inside Work, with page navigation, zoom, and selectable text. Use public PDF sources that allow cross-origin reading (CORS), such as raw GitHub files or arXiv. GitHub blob links are converted to raw content for the reader. Hosts that require sign-in, block CORS, or serve a non-PDF retain an external Open PDF link when the inline preview is unavailable.

An `Added` row requires both nonblank long summaries. The website never falls back between English and Italian summaries; each locale uses only its own long and optional short summary.

The website renders only approved Notion entries when `NOTION_TOKEN` and `NOTION_DATABASE_ID` are present. GitHub can enrich matching approved entries with creation timestamps and detected language, but cannot publish additional repositories, replace approved summaries, or block publication when its optional data is unavailable or malformed. Stack coverage is checked against Notion-owned project labels; a missing Stack entry for optional GitHub language is not a publication gate. If Notion is unconfigured or unavailable, the Projects page renders zero cards with an explicit unavailable state; an empty approved result renders zero cards with an explicit no-approved-projects state.

Notion changes reach `/api/webhooks/notion`. Authenticated events from the explicitly configured Projects or Stack data source invalidate the localized Home and Projects pages plus their shared publication cache. Database IDs remain the read configuration; `NOTION_PROJECTS_DATA_SOURCE_ID` and `NOTION_STACK_DATA_SOURCE_ID` are separately required because current Notion webhook payloads identify data sources rather than their parent database pages. Missing or duplicate webhook source IDs return `503` instead of silently accepting an event without invalidation. The next request loads one cached canonical Projects+Stack snapshot; it is cached only after both sources, approved website URLs, project-to-Stack coverage, and Stack icons validate. A daily cache expiry is retained for delayed or missed webhooks. Payload page content, drafts, and media remain request-time data and are not included in this cache.

All Stack records are displayed on the homepage. Stack records require `Name` (title), `Category` (select), and `Icon key` (an Iconify `collection:icon` key or a trusted Notion-hosted asset URL). Every technology referenced by an approved project must resolve to one Stack record. Production requests require `NOTION_TOKEN`, `NOTION_STACK_DATABASE_ID`, and a non-empty valid Stack database. A failed source read, missing project technology, invalid approved website URL, or missing icon rejects the complete snapshot so partial data is never cached. Local and preview requests retain their explicit unavailable/empty states when the canonical source is unconfigured or unavailable; there is no checked-in Stack fallback.

Time-based refresh failures retain the last validated snapshot through Next's data cache. Explicit webhook invalidation expires it immediately: withdrawals, cold caches, changed source configuration and failed event-driven refreshes fail closed. A signed event arriving during a refresh rejects the older result before it can repopulate the cache. This does not cache Payload copy, previews, permissions or media, and does not preserve the cache across image replacement.

Source refresh results and pending signed events write only timestamps, a public-content digest and record counts to `/data/publication-health`; no provider payloads or credentials are recorded. The atomic `metrics.prom` file feeds Infra's existing node-exporter and owned Alerts route. A failed refresh is actionable even while the last valid snapshot still renders. Daily freshness measures successful source verification, so unchanged content is not a failure. Home and Projects expose the snapshot digest and verification time as hidden HTML attributes for delivery verification.

## Useful scripts
```bash
# Preview missing public GitHub repos without writing to Notion
pnpm sync:notion

# Apply the reviewed row-creation preview as Status="To Add"
pnpm sync:notion -- --apply

# Read the Projects schema and print the Summary IT activation plan (no writes)
pnpm check:notion-projects-schema

# Produce a reviewable repository-technology candidate with Codex
pnpm extract:repository-technologies -- --repository Itakello/mstefan-dev

# Combine exact-commit evidence with the curated public technology selection
# into a non-publishing repository/Stack/summary proposal
pnpm propose:repository-sync -- --repository Itakello/mstefan-dev
```
Required env for scripts:
- sync: `NOTION_TOKEN`, `NOTION_DATABASE_ID`, optional `GITHUB_TOKEN`, optional `GITHUB_USER`
- Projects schema check: `NOTION_TOKEN` and `NOTION_PROJECTS_DATABASE_ID` (preferred), or `NOTION_DATABASE_ID` as the repository default.

The Projects schema check reads only the configured database and emits deterministic JSON. Its states are `ready` when `Summary IT` is already `rich_text`, `changes-required` when that exact property is missing and should be added as `rich_text`, and `blocked` for missing configuration, provider read failures, ambiguous schema responses, or an existing property with the wrong type. Output includes the configured database ID but never the token. `applyAllowed` is always `false`: this task intentionally does not apply provider changes, and `--apply` is unsupported pending explicit approval. `Summary IT` is required for `Added` publication; this activation does not create or change `Short summary IT`.

The repository-technology extractor compares `HEAD` with the last successfully
processed SHA before invoking Codex. It analyzes an isolated snapshot containing
only bounded text evidence exported from files tracked at that commit. Codex
runs without shell or web tools, receives the current complete manifest, and can
cite only files whose content was supplied. Deterministic code validates the
structured response, computes the actual technology diff, and writes state under the ignored
`.artifacts/repository-technologies/` directory. A failed attempt preserves the
last successful SHA and manifest so the same commit remains retryable.
Evidence manifests use schema v2: `summary` is one complete approval unit with
required nonblank `en` and `it` values. The extractor writes natural English and
technical Italian together while preserving repository, product, framework,
language, tool, and model names. Legacy v1/string-summary evidence is invalid
and is re-extracted rather than being silently converted. The bounded extractor
fails visibly instead of producing a partial manifest when an
analyzed text file exceeds 128 KiB, total text evidence exceeds 512 KiB, the
serialized evidence exceeds 768 KiB, or more than 500 files require analysis.
When it re-extracts persisted evidence, the result and state record a non-secret
`evidenceStatus` plus `reextractedBecause`. Running or failed work reports the
pending reason (`invalid-manifest` or `missing-evidence`); only a successful
run reports `invalid-reextracted` or `missing-reextracted`.

The proposal combines the validated manifest with the repository's curated
`.github/project-technologies.json` selection. It requires GitHub metadata to
explicitly identify a repository as public, non-private, non-archived, and
non-forked; rejects curated technologies without committed-file
evidence; requires both labeled `summaryProposal.value.en` and
`summaryProposal.value.it` before the proposal can be approved; and marks
generated summaries and publication as approval-blocked. It never publishes or
writes to Notion, GitHub, Stack, or another provider.

This proposal flow is intentionally manual and local: it does not commit, publish, deploy,
write to Notion, schedule itself, or receive webhooks. It uses `gpt-6.1-sol` by
default; `REPOSITORY_TECHNOLOGIES_MODEL` accepts only `gpt-6.1-sol`,
`gpt-6-luna`, or `gpt-6-astra`, all with medium reasoning. Other models are rejected.
A future hosted trigger should use the official
Codex GitHub Action or a dedicated backend so repository-controlled wrapper code
never receives the API key.

## API
- `GET /api/projects/diff` — lists GitHub repos not yet present on the site (based on curated/Notion URLs).

## Deployment

The public `mstefan.dev` site runs on Openship using the root Dockerfile and the existing persistent Payload volume. Follow the [production runtime procedure](deploy/payload-production/README.md) for routing, backups, and deployment. Successful push CI runs on `master` trigger the [guarded event deployment](deploy/event/README.md) to the existing Openship project when `MSTEFAN_EVENT_DEPLOY_ENABLED=true`. The host validates the exact commit, activation window, persistent-volume writer, and public/private route checks. Native Openship auto-deploy stays disabled so there is only one deployment source. Pause new events by setting the repository variable to `false`; use the event procedure for attended recovery.

Set `POSTHOG_PROJECT_TOKEN` in that project's production runtime environment and enable stateless Cookieless server hash mode in the EU PostHog project to activate public website analytics. See [Website analytics](deploy/payload-production/README.md#website-analytics) for collection boundaries and measurement limitations. Private runtimes do not collect analytics.

## Project structure
```text
app/                # App Router pages and routes
  [locale]/         # Localized public pages and metadata
    about/
    layout.tsx
    page.tsx
    projects/
  api/projects/diff/
  globals.css
components/         # UI components
lib/                # Notion and GitHub integration helpers
public/             # Static assets (og image, icon, sitemap, robots)
scripts/            # Notion/GitHub automation scripts
```

## Notes
- MDX is enabled; you can add `.mdx` pages/components if desired.
- The Projects page treats Notion as publication authority when configured; GitHub-only repositories remain unpublished until approved there.

## Documentation maintenance

The bounded Codex auto-documentation pilot is described in [`docs/automation/auto-documentation.md`](docs/automation/auto-documentation.md). It is manual-only until its draft-PR, replay, failure, and cost checks are proven.
