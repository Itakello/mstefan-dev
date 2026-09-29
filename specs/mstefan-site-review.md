# Public website review

**Status:** Proposed for pull-request review

**Seed:** `e2e/seed.ts`

**Generated test:** `e2e/mstefan-site.review.spec.ts`

## Review the primary bilingual visitor journey

### Starting state

- Use the isolated production build of the exact pull-request head SHA, with disposable Payload SQLite seeded from the checked-in bilingual copy. Approved bilingual Notion records are synthetic; personal-site browser requests are routed to the same isolated build, Karakal stays link-only, and Iconify decoration is stubbed as unavailable; other external requests fail. External integrations are offline; this evidence does not validate live Notion data or deployment.
- Use a fresh Chromium context at a 1280 × 720 viewport.
- Start in light mode.

### Steps and expected outcomes

1. Open `/en`. The English introduction and Selected work heading are visible.
2. Follow Work to `/en/projects`. One project list selects details and links above a single preview. Desktop/Mobile buttons with matching icons change its real viewport between 1280px and 390px. Navigate to About and toggle both directions; the same page remains loaded and the preview stage keeps its height. Switch projects and return; the homepage restarts. Karakal remains link-only; website-only and repository-only selections expose only their available links. `/en/websites` redirects to Work.
3. Follow the About navigation link. The URL ends in `/en/about`; the main branch heading, profile text, and centered portrait are visible. Selecting an experience without a summary or document keeps the profile and offers no Read story link. One with a summary shows its own story and optional photo; one with an attached PDF shows an inline reader and download link.
4. Toggle the theme. The document enters dark mode.
5. Switch the language to Italian. The same page becomes `/it/about`; the main branch heading, Italian profile, and Lavori navigation link are visible.

### Gallery boundaries

- Exercise the same-origin personal preview through three nested ancestors; the third stops embedding and retains an external link.
- Exercise multiple, one, empty, and failed synthetic publication states; empty/error states never invent gallery entries.
- Verify the 360px gallery viewport has no horizontal overflow, bilingual navigation, light/dark themes, and zero browser errors in the primary journey.
- This proves the production build against controlled records. Configured live Notion schema/membership and deployed public behavior require separate evidence.

### Failure conditions

Any missing assertion, unexpected route, browser error, unavailable production fixture, absent video, or evidence-packaging failure fails the review. The test must not be skipped, marked `fixme`, or healed by weakening an expectation.
