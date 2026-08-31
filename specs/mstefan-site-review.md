# Public website review

**Status:** Proposed for pull-request review

**Seed:** `e2e/seed.ts`

**Generated test:** `e2e/mstefan-site.review.spec.ts`

## Review the primary bilingual visitor journey

### Starting state

- Use the exact successful Vercel Preview deployment for the pull-request head SHA.
- Use a fresh Chromium context at a 1280 × 720 viewport.
- Start in light mode.

### Steps and expected outcomes

1. Open `/en`. The English introduction and Selected work heading are visible.
2. Follow the Projects navigation link. The URL ends in `/en/projects` and the Public projects heading is visible.
3. Follow the About navigation link. The URL ends in `/en/about`; the About heading and portrait are visible.
4. Toggle the theme. The document enters dark mode.
5. Switch the language to Italian. The same page becomes `/it/about`; the Profilo heading and Progetti navigation link are visible.

### Failure conditions

Any missing assertion, unexpected route, browser error, unavailable preview, absent video, or evidence-packaging failure fails the review. The test must not be skipped, marked `fixme`, or healed by weakening an expectation.
