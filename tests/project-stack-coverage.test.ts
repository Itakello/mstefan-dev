import assert from "node:assert/strict";
import test from "node:test";

import {
  assertProjectStackCoverage,
  projectStackLabels,
  type StackEntry,
} from "../lib/stack";

const catalog: StackEntry[] = [
  { name: "TypeScript", category: "Language", iconKey: "simple-icons:typescript", websiteVisible: true },
  { name: "Next.js", category: "Framework", iconKey: "simple-icons:nextdotjs", websiteVisible: true },
  { name: "Loguru", category: "Library", iconKey: "simple-icons:python", websiteVisible: false },
];

test("builds one canonical technology label list", () => {
  assert.deepEqual(
    projectStackLabels({ tags: ["TypeScript", "Next.js", "Loguru"] }),
    ["TypeScript", "Next.js", "Loguru"],
  );
  assert.deepEqual(
    projectStackLabels({ language: "TypeScript", tags: ["TypeScript", "Next.js"] }),
    ["TypeScript", "Next.js"],
  );
});

test("accepts projects whose technologies all resolve through Stack", () => {
  assert.doesNotThrow(() => assertProjectStackCoverage([
    { title: "Personal website", language: "TypeScript", tags: ["Next.js"] },
    { title: "Legacy Python project", tags: ["Loguru"] },
  ], catalog));
});

test("blocks publication with project and missing Stack label evidence", () => {
  assert.throws(
    () => assertProjectStackCoverage([
      { title: "Personal website", language: "TypeScript", tags: ["React", "Vercel"] },
    ], catalog),
    /Personal website: React, Personal website: Vercel/,
  );
});
