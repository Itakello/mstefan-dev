import assert from "node:assert/strict";
import test from "node:test";

import { groupStackEntries, type StackEntry } from "../lib/stack";

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
