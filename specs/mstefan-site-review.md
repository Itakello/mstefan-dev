# Public website review

**Status:** Proposed for pull-request review

**Seed:** `e2e/seed.ts`

**Generated test:** `e2e/mstefan-site.review.spec.ts`

## Review the primary bilingual visitor journey

### Starting state

- Use the isolated production build of the exact pull-request head SHA, with disposable Payload SQLite seeded from the checked-in bilingual copy. Approved bilingual Notion records are synthetic; personal-site browser requests are routed to the same isolated build, website screenshot assets are served from the checked-in captures, and Iconify decoration is stubbed as unavailable; other external requests fail. External integrations are offline; this evidence does not validate live Notion data or deployment.
- Use a fresh Chromium context at a 1280 × 720 viewport.
- Start in light mode.

### Steps and expected outcomes

1. Open `/en`. The English introduction and Selected work heading are visible. Toolkit categories wrap without sideways scrolling, and phone summaries use their own full-width row.
2. Follow Work to `/en/projects`. A compact desktop project list selects details and links above a single preview without its own scrollbar. Below 1024px, a labeled native picker replaces the list and keeps selection and preview resets in sync. Desktop/Mobile buttons with matching icons select passive homepage images captured at 1280px and 390px. Neither image loads an embedded website. Karakal also displays screenshot previews; website-only and repository-only selections expose only their available links. `/en/websites` redirects to Work.
3. Follow the About navigation link. The URL ends in `/en/about`. At desktop widths of at least 1100px, the profile is left of the career graph with their top edges aligned; on mobile, the profile precedes a full-width chronological experience list without an internal scrollbar; the graph is hidden and list buttons remain keyboard-accessible. The profile heading and portrait are visible. Selecting the fixture experience without a summary or document keeps the profile and offers no Read story link; returning to the main branch preserves the profile and portrait.
4. Toggle the theme. The document enters dark mode.
5. Switch the language to Italian. The same page becomes `/it/about`; the main branch heading, Italian profile, and Lavori navigation link are visible.

### Gallery boundaries

- Verify website previews are static desktop/mobile screenshots with no iframe. Missing images, including failures before hydration, retain the external visit link and recover when switching to an available capture.
- Verify additional approved page targets expose a keyboard-accessible selector, preserve desktop/mobile switching on every page, reset to the homepage when changing projects, and localize the homepage label. One-page sites expose no page selector.
- Exercise multiple, one, empty, and failed synthetic publication states; empty/error states never invent gallery entries.
- Verify the 360px gallery viewport has no horizontal overflow, bilingual navigation, light/dark themes, and zero browser errors in the primary journey.
- This proves the production build against controlled records. Configured live Notion schema/membership and deployed public behavior require separate evidence.

### Failure conditions

Any missing assertion, unexpected route, browser error, unavailable production fixture, absent video, or evidence-packaging failure fails the review. The test must not be skipped, marked `fixme`, or healed by weakening an expectation.
