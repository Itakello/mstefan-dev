# mstefan.dev

Minimal, fast portfolio. Next.js App Router + Tailwind + MDX + lucide-react.

## Quick start

```bash
pnpm i   # or yarn or npm
pnpm dev
```

## Deploy on Vercel

1. Push to GitHub.
2. Import the repo in Vercel.
3. Set your domain to `mstefan.dev` in Vercel Domains.
4. Build command: `next build` (postbuild will generate sitemap/robots).

## Tweak accent color

Edit `app/globals.css`:
```css
:root { --accent: 350 89% 56%; } /* HSL */
```

## Edit content

- Projects: `content/projects.ts`
- About: `app/about/page.mdx`
- Contact links: `app/contact/page.tsx`
