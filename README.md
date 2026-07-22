## mstefan.dev — Minimal, fast portfolio

Next.js 14 App Router portfolio with TypeScript, Tailwind CSS, MDX support, and optional Notion + GitHub enrichment.

- **Live**: `https://mstefan.dev`

### Features
- **Fast, minimal UI** with dark mode toggle and a single accent color.
- **Projects** page merges a curated list with your GitHub repos and (optionally) a Notion database.
- **MDX** support for content when you need it.
- **SEO ready**: Open Graph/Twitter metadata and automatic sitemap/robots generation.
- **Utility scripts** to sync GitHub repos into Notion and enrich entries using LLMs.

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

## Quick start
```bash
pnpm i   # or: npm i / yarn
pnpm dev
# open http://localhost:3000
```

## Configure and personalize
- **Site metadata**: `app/layout.tsx` (title, description, OG images, icons).
- **Header name + nav**: `components/Header.tsx`.
- **Accent color**: `app/globals.css`
  ```css
  :root { --accent: 350 89% 56%; }
  ```
- **Home content**: `app/page.tsx`.
- **About**: `app/about/page.tsx`.
- **Contact links**: `app/contact/page.tsx`.
- **Featured/curated projects**: `content/projects.ts`.

If you fork this repo, also update the hardcoded GitHub username used for repo fetching:
- `app/projects/page.tsx`: `const GITHUB_USER = "Itakello"`
- `app/api/projects/diff/route.ts`: `const GITHUB_USER = "Itakello"`

## Environment variables
These are optional unless you use the Notion and enrichment scripts.

- `NOTION_TOKEN`: Notion integration token
- `NOTION_DATABASE_ID`: Target database ID
- `NOTION_STACK_DATABASE_ID`: Stack database ID used by the About page and project technology icons
- `GITHUB_TOKEN` (optional): increases GitHub API rate limit for server-side fetching
- `OPENAI_API_KEY` (only for enrichment script)
- `GITHUB_USER` (optional for scripts): defaults to `Itakello`

Notion database expected properties (create these columns):
- `Name` (title)
- `URL` (url)
- `Summary` (rich_text)
- `Tags` (multi_select)
- `Language` (select)
- `Year` (number)
- `Status` (status: "To Add", "Added", "Removed")

The website will render from Notion when `NOTION_TOKEN` and `NOTION_DATABASE_ID` are present; otherwise it falls back to `content/projects.ts` plus GitHub repos.

Stack records require `Name` (title), `Category` (select), `Icon key` (an Iconify `collection:icon` key or a trusted Notion-hosted asset URL), and `Website visible` (checkbox). Vercel production builds require `NOTION_TOKEN`, `NOTION_STACK_DATABASE_ID`, and a non-empty valid Stack database. A failed production read or missing icon blocks publication so the previous deployment stays live. Local and preview builds may use the checked-in fallback catalog.

## Useful scripts
```bash
# Add missing GitHub repos to Notion as rows with Status="To Add"
pnpm sync:notion

# Enrich Notion rows (summary + tags) using README + LLM
pnpm enrich:notion

# Produce a reviewable repository-technology candidate with Codex
pnpm extract:repository-technologies -- --repository Itakello/mstefan-dev
```
Required env for scripts:
- sync: `NOTION_TOKEN`, `NOTION_DATABASE_ID`, optional `GITHUB_TOKEN`, optional `GITHUB_USER`
- enrich: `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `OPENAI_API_KEY`, optional `GITHUB_TOKEN`

The repository-technology extractor compares `HEAD` with the last successfully
processed SHA before invoking Codex. It analyzes an isolated snapshot containing
only bounded text evidence exported from files tracked at that commit. Codex
runs without shell or web tools, receives the current complete manifest, and can
cite only files whose content was supplied. Deterministic code validates the
structured response, computes the actual technology diff, and writes state under the ignored
`.artifacts/repository-technologies/` directory. A failed attempt preserves the
last successful SHA and manifest so the same commit remains retryable.
The bounded v1 fails visibly instead of producing a partial manifest when an
analyzed text file exceeds 64 KiB, total text evidence exceeds 512 KiB, the
serialized evidence exceeds 768 KiB, or more than 500 files require analysis.

This v1 is intentionally manual and local: it does not commit, publish, deploy,
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
  about/
  api/projects/diff/
  contact/
  projects/
components/         # UI components
content/            # Curated projects list
lib/                # Notion integration helpers
public/             # Static assets (og image, icon, sitemap, robots)
scripts/            # Notion/GitHub automation scripts
```

## Notes
- MDX is enabled; you can add `.mdx` pages/components if desired.
- The Projects page merges curated items with GitHub repos; Notion (when configured) can replace the curated list entirely.
