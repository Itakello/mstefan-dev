## mstefan.dev — Minimal, fast portfolio

Next.js 14 App Router portfolio with TypeScript, Tailwind CSS, MDX support, and an approval-gated Notion + GitHub project catalog.

- **Live**: `https://mstefan.dev`

### Features
- **Fast, minimal UI** with dark mode toggle and a single accent color.
- **Projects** page publishes approved Notion entries only and fails closed when that source is unavailable.
- **MDX** support for content when you need it.
- **SEO ready**: Open Graph/Twitter metadata and automatic sitemap/robots generation.
- **Utility scripts** to preview missing Notion rows and generate evidence-grounded repository proposals for review.

## Tech stack
- **Next.js 14 (App Router)**
- **TypeScript**
- **Tailwind CSS** (+ typography)
- **MDX** via `@next/mdx`
- **lucide-react** icons
- **Notion SDK** (optional)
- **next-sitemap** for sitemap/robots

## Requirements
- Node.js 18.17+ (recommended: latest LTS)
- pnpm (or npm/yarn). This repo uses pnpm: `pnpm@10`.
- Codex CLI `0.146.0` for `extract:repository-technologies`. Install the validated version with `npm install -g @openai/codex@0.146.0`, authenticate with `codex login` (or `printenv OPENAI_API_KEY | codex login --with-api-key`), then confirm both access and the supported version with `codex login status` and `codex --version`.

## Quick start
```bash
pnpm i   # or: npm i / yarn
pnpm dev
# open http://localhost:3000
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
- `URL` (url)
- `Summary` (rich_text, required English long summary)
- `Summary IT` (rich_text, required Italian long summary)
- `Short summary` (rich_text, optional English short summary)
- `Short summary IT` (rich_text, optional Italian short summary)
- `Tags` (multi_select)
- `Language` (multi_select)
- `Year` (number)
- `Status` (status: "To Add", "Added", "Removed")

An `Added` row requires both nonblank long summaries. The website never falls back between English and Italian summaries; each locale uses only its own long and optional short summary.

The website renders only approved Notion entries when `NOTION_TOKEN` and `NOTION_DATABASE_ID` are present. GitHub can enrich matching approved entries with timestamps and detected language, but cannot publish additional repositories or replace approved summaries. If Notion is unconfigured or unavailable, the Projects page renders zero cards with an explicit unavailable state; an empty approved result renders zero cards with an explicit no-approved-projects state.

Notion changes reach `/api/webhooks/notion`. Authenticated events from the explicitly configured Projects or Stack data source invalidate the localized Home and Projects pages plus their shared GitHub enrichment cache. Database IDs remain the read configuration; `NOTION_PROJECTS_DATA_SOURCE_ID` and `NOTION_STACK_DATA_SOURCE_ID` are separately required because current Notion webhook payloads identify data sources rather than their parent database pages. Missing or duplicate webhook source IDs return `503` instead of silently accepting an event without invalidation. The next visit fetches the latest canonical data and publishes it only after the complete Projects and Stack contract passes. A daily revalidation is retained only as recovery for a delayed or missed webhook.

Stack records require `Name` (title), `Category` (select), `Icon key` (an Iconify `collection:icon` key or a trusted Notion-hosted asset URL), and `Website visible` (checkbox). Every technology referenced by an approved project must resolve to one Stack record, whether or not that record is visible in the general Toolkit. Vercel production builds and refreshes require `NOTION_TOKEN`, `NOTION_STACK_DATABASE_ID`, and a non-empty valid Stack database. A failed production read, missing project technology, or missing icon blocks regeneration so the previous valid page remains live. Local and preview builds render zero Stack items with an explicit state when the canonical source is unconfigured, empty, or unavailable; there is no checked-in Stack fallback.

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
write to Notion, schedule itself, or receive webhooks. It uses `gpt-5.6-terra` by
default; set `REPOSITORY_TECHNOLOGIES_MODEL` only when a different supported
extraction model is warranted. A future hosted trigger should use the official
Codex GitHub Action or a dedicated backend so repository-controlled wrapper code
never receives the API key.

## API
- `GET /api/projects/diff` — lists GitHub repos not yet present on the site (based on curated/Notion URLs).

## Deployment (Vercel)
1. Push to GitHub.
2. Import the repo in Vercel.
3. Set env vars as needed (see above).
4. Build command: `next build`.
5. After build, `postbuild` runs `next-sitemap` and writes sitemap/robots into `public/`.
6. Configure your custom domain in Vercel.

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
