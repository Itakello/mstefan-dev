import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { classifyVisualReview } from "../scripts/visual-review/classify.mjs";
import { iconFixtureResponse } from "../e2e/offline-review";

test("runs for conservative UI-impacting paths", () => {
  const result = classifyVisualReview([
    "docs/architecture.md",
    "components/Header.tsx",
    "pnpm-lock.yaml",
  ]);

  assert.equal(result.run, true);
  assert.deepEqual(result.matched, ["components/Header.tsx", "pnpm-lock.yaml"]);
});

test("skips browser work for documentation and unrelated automation", () => {
  const result = classifyVisualReview([
    "README.md",
    "docs/automation/auto-documentation.md",
    ".github/workflows/docs-updater.md",
    "scripts/check-pr-body.mjs",
  ]);

  assert.equal(result.run, false);
  assert.equal(result.reason, "no UI-impacting paths changed");
});

test("manual label override forces visual review", () => {
  const result = classifyVisualReview(["README.md"], { force: true });

  assert.equal(result.run, true);
  assert.match(result.reason, /visual-review/);
});

test("supported agents exclude the stock healer", () => {
  assert.equal(existsSync(new URL("../.codex/agents/playwright_test_planner.toml", import.meta.url)), true);
  assert.equal(existsSync(new URL("../.codex/agents/playwright_test_generator.toml", import.meta.url)), true);
  assert.equal(existsSync(new URL("../.codex/agents/playwright_test_healer.toml", import.meta.url)), false);
});

test("browser tests cannot silently suppress failures", () => {
  const reviewDirectory = new URL("../e2e/", import.meta.url);
  const reviewTests = readdirSync(reviewDirectory)
    .filter((name) => /\.(review|smoke|consistency)\.spec\.ts$/.test(name));
  const prohibited = ["test.skip", "test.fixme", "test.fail", "test.only"];

  assert.notEqual(reviewTests.length, 0);
  for (const file of reviewTests) {
    const source = readFileSync(new URL(file, reviewDirectory), "utf8");
    for (const token of prohibited) {
      assert.equal(source.includes(token), false, `${token} is prohibited in ${file}`);
    }
    for (const assertion of source.matchAll(/expect\.soft\([^\n]*?\)\.(\w+)/g)) {
      assert.equal(assertion[1], "toHaveScreenshot", `Only failing screenshot assertions may accumulate evidence in ${file}`);
    }
  }
});

test("offline icon fixture serves genuine pinned artwork and refuses missing icons", async () => {
  const brands = await iconFixtureResponse(new URL("https://api.iconify.design/simple-icons.json?icons=github,linkedin,x"));
  assert.deepEqual(Object.keys(brands.icons), ["github", "linkedin", "x"]);
  for (const icon of Object.values(brands.icons)) assert.match(icon.body, /<path\b/);
  const alias = await iconFixtureResponse(new URL("https://api.iconify.design/lucide.json?icons=code-2"));
  assert.match(alias.icons["code-2"].body, /<path\b/);
  await assert.rejects(iconFixtureResponse(new URL("https://api.iconify.design/simple-icons.json?icons=unrecorded-brand")), /Missing official visual icon fixture/);
  await assert.rejects(iconFixtureResponse(new URL("https://api.iconify.design/unknown.json?icons=github")), /Missing official visual icon collection/);
});

test("pinned artwork changes require visual review", () => {
  assert.equal(classifyVisualReview(["tests/fixtures/visual-icons/simple-icons.json"]).run, true);
  assert.equal(classifyVisualReview(["DESIGN.md"]).run, true);
  assert.equal(classifyVisualReview(["AGENTS.md"]).run, true);
});

test("CMS persistence and request-boundary changes require browser review", () => {
  for (const file of ["payload.config.ts", "proxy.ts", "migrations/initial.ts", "tests/cms/offline-fetch.mjs"]) {
    assert.equal(classifyVisualReview([file]).run, true, file);
  }
});
