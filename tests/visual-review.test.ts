import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { classifyVisualReview } from "../scripts/visual-review/classify.mjs";

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

test("review tests cannot silently suppress failures", () => {
  const reviewDirectory = new URL("../e2e/", import.meta.url);
  const reviewTests = readdirSync(reviewDirectory)
    .filter((name) => name.endsWith(".review.spec.ts"));
  const prohibited = ["test.skip", "test.fixme", "test.fail", "test.only", "expect.soft"];

  assert.notEqual(reviewTests.length, 0);
  for (const file of reviewTests) {
    const source = readFileSync(new URL(file, reviewDirectory), "utf8");
    for (const token of prohibited) {
      assert.equal(source.includes(token), false, `${token} is prohibited in ${file}`);
    }
  }
});
