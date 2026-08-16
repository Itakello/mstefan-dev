import assert from "node:assert/strict";
import test from "node:test";

import {
  groupStackEntries,
  STACK_SHELF_VISIBLE_LIMIT,
  summarizeStackEntries,
  type StackEntry,
} from "../lib/stack";

function stack(name: string, category: string): StackEntry {
  return {
    name,
    category,
    iconKey: "lucide:box",
    websiteVisible: true,
  };
}

test("groups Stack entries by their canonical Notion category", () => {
  assert.deepEqual(
    groupStackEntries([
      stack("React", "Framework"),
      stack("Python", "Language"),
      stack("TypeScript", "Language"),
      stack("MongoDB", "Database"),
    ]),
    [
      { category: "Language", entries: [stack("Python", "Language"), stack("TypeScript", "Language")] },
      { category: "Framework", entries: [stack("React", "Framework")] },
      { category: "Database", entries: [stack("MongoDB", "Database")] },
    ],
  );
});

test("keeps new categories visible with a deterministic fallback order", () => {
  assert.deepEqual(
    groupStackEntries([stack("Second", "Zed"), stack("First", "Alpha")]).map(({ category }) => category),
    ["Alpha", "Zed"],
  );
});

test("caps a shelf group at four visible technologies and reports the remainder", () => {
  const entries = Array.from({ length: 9 }, (_, index) => stack(`Tool ${index + 1}`, "CLI"));
  const summary = summarizeStackEntries(entries);

  assert.equal(STACK_SHELF_VISIBLE_LIMIT, 4);
  assert.deepEqual(summary.visibleEntries, entries.slice(0, 4));
  assert.deepEqual(summary.hiddenEntries, entries.slice(4));
  assert.equal(summary.overflowCount, 5);
});

test("omits shelf overflow when a category fits within the visible limit", () => {
  const entries = [stack("React", "Framework"), stack("Next.js", "Framework")];

  assert.deepEqual(summarizeStackEntries(entries), {
    visibleEntries: entries,
    hiddenEntries: [],
    overflowCount: 0,
  });
});
