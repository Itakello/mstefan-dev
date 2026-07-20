import assert from "node:assert/strict";
import test from "node:test";

import { assertUniqueStackEntries, parseStackPage } from "../lib/notion";

function stackPage(overrides: Record<string, unknown> = {}) {
  return {
    id: "stack-page",
    properties: {
      Name: { title: [{ plain_text: "TypeScript" }] },
      Category: { select: { name: "Language" } },
      "Icon key": { rich_text: [{ plain_text: "logos:typescript-icon" }] },
      "Website visible": { checkbox: false },
      ...overrides
    }
  };
}

test("parses a complete hidden Stack row", () => {
  assert.deepEqual(parseStackPage(stackPage()), {
    name: "TypeScript",
    category: "Language",
    iconKey: "logos:typescript-icon",
    proficiency: undefined,
    websiteVisible: false
  });
});

test("rejects missing required fields and invalid Iconify keys", () => {
  assert.throws(() => parseStackPage(stackPage({ Name: { title: [] } })), /Name is required/);
  assert.throws(() => parseStackPage(stackPage({ Category: { select: null } })), /Category is required/);
  assert.throws(
    () => parseStackPage(stackPage({ "Icon key": { rich_text: [{ plain_text: "typescript" }] } })),
    /collection:icon/
  );
  assert.throws(
    () => parseStackPage(stackPage({ "Website visible": {} })),
    /Website visible must be a checkbox/
  );
});

test("rejects duplicate names and Iconify keys", () => {
  const first = parseStackPage(stackPage());
  assert.throws(() => assertUniqueStackEntries([first, { ...first }]), /duplicate name TypeScript/);
  assert.throws(
    () => assertUniqueStackEntries([first, { ...first, name: "JavaScript" }]),
    /duplicate Icon key logos:typescript-icon/
  );
});
