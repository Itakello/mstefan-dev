# Component workshop

Run `pnpm workshop`, then open http://127.0.0.1:3000. Stop the website's dev server first: both commands use its existing loopback development address. The workshop is a local development tool, not a public site route.

The stories import the production brand links, Stack, project cards, Work explorer and Career graph. Use the theme toolbar for light/dark, resize the browser for responsive layouts, and interact with the real controls. Sample content lives only in `workshop/fixtures.ts`; official artwork is preloaded from the existing licensed visual-test fixtures. Notion remains the publication source.

## Verification

- `pnpm build:workshop` builds the isolated workshop.
- `pnpm test:workshop` builds it, serves it on an ephemeral loopback test port, checks every story at desktop/mobile in both themes, and exercises focus, disclosure, selection, scrolling and link targets. External requests fail the check.
- `node scripts/visual-review/run-fixture.mjs` verifies the closest real page journeys and page screenshots.

CI runs both checks and uploads current component captures alongside page evidence. New or intentionally changed references require rendered review against `DESIGN.md` before running `node scripts/visual-review/run-workshop.mjs --update-snapshots` in the matching OS/browser environment. Career's test clock is fixed because its timeline geometry includes the current date. Adding a story automatically adds it to the screenshot matrix.

## Tool choice

Storybook 10.6.1 with its official Next.js/Vite integration matches the existing Notion task and provides isolated rendering of the actual Next components. Its declared peers cover this repository's Next 16 and React 19 versions. The [official integration](https://storybook.js.org/docs/get-started/frameworks/nextjs-vite) supplies Next context without hand-written substitutes. Existing Playwright handles visual and interaction checks; no additional test runner, paid service or workshop host is needed.
