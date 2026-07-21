import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { buildNotionProperties } = require("../scripts/sync-github-to-notion.js");

test("maps GitHub language to the live Notion multi-select schema", () => {
  const properties = buildNotionProperties({
    name: "example",
    html_url: "https://github.com/Itakello/example",
    description: "Example repository",
    language: "TypeScript",
    pushed_at: "2026-07-21T00:00:00Z",
  });

  assert.deepEqual(properties.Language, {
    multi_select: [{ name: "TypeScript" }],
  });
  assert.equal("select" in properties.Language, false);
});

test("omits Language when GitHub has not detected one", () => {
  const properties = buildNotionProperties({
    name: "example",
    html_url: "https://github.com/Itakello/example",
    description: null,
    language: null,
    pushed_at: "2026-07-21T00:00:00Z",
  });

  assert.equal(properties.Language, undefined);
});
