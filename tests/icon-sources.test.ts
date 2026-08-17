import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { BRAND_ICON_CLASS } from "../lib/iconStyles";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.[jt]sx?$/.test(entry.name) ? [entryPath] : [];
  });
}

test("does not render skill-icons artwork", () => {
  const renderedSources = ["app", "components"].flatMap(sourceFiles);
  const offenders = renderedSources.filter((file) => readFileSync(file, "utf8").includes("skill-icons:"));

  assert.deepEqual(offenders, []);
});

test("uses a 16px default for comparable brand icons", () => {
  assert.equal(BRAND_ICON_CLASS, "size-4");
});
