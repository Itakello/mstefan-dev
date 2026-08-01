import assert from "node:assert/strict";
import test from "node:test";

import { mergeAndEnrichProjects, resolveProjectPublicationState } from "../lib/projectPublication";

const githubRepo = {
  name: "unapproved-repository",
  description: "Must not bypass Notion approval.",
  html_url: "https://github.com/Itakello/unapproved-repository",
  language: "TypeScript",
  archived: false,
  fork: false,
  pushed_at: "2026-08-01T00:00:00Z",
};

test("never appends GitHub repositories that are absent from the approved source", () => {
  const result = mergeAndEnrichProjects([], [githubRepo]);
  assert.deepEqual(result, { groups: {}, orderedYears: [] });
});

test("fails closed for missing, empty, and failed publication sources", () => {
  assert.deepEqual(resolveProjectPublicationState(null), {
    status: "unconfigured",
    projects: [],
    message: "Projects are unavailable because the publication source is not configured.",
  });
  assert.deepEqual(resolveProjectPublicationState([]), {
    status: "empty",
    projects: [],
    message: "No projects are currently approved for publication.",
  });
  assert.deepEqual(resolveProjectPublicationState(null, true), {
    status: "error",
    projects: [],
    message: "Projects are temporarily unavailable because the publication source could not be loaded.",
  });
});
