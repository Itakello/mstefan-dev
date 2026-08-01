import assert from "node:assert/strict";
import test from "node:test";

import { mergeAndEnrichProjects } from "../lib/projectPublication";

const githubRepo = {
  name: "unapproved-repository",
  description: "Must not bypass Notion approval.",
  html_url: "https://github.com/Itakello/unapproved-repository",
  language: "TypeScript",
  archived: false,
  fork: false,
  pushed_at: "2026-08-01T00:00:00Z",
};

test("does not append unapproved GitHub repositories when Notion is authoritative", () => {
  const result = mergeAndEnrichProjects([], [githubRepo], false);
  assert.deepEqual(result, { groups: {}, orderedYears: [] });
});

test("keeps GitHub fallback behavior when no Notion source is configured", () => {
  const result = mergeAndEnrichProjects([], [githubRepo], true);
  assert.equal(result.groups["2026"][0].title, "Unapproved Repository");
});
