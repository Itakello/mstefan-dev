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
  created_at: "2024-03-15T12:00:00Z",
  pushed_at: "2026-08-01T00:00:00Z",
};

test("never appends GitHub repositories that are absent from the approved source", () => {
  const result = mergeAndEnrichProjects([], [githubRepo]);
  assert.deepEqual(result, { groups: {}, orderedYears: [] });
});

test("enriches an approved project with repository creation metadata without changing its copy", () => {
  const result = mergeAndEnrichProjects([
    {
      title: "example",
      shortSummary: "Short approved copy.",
      summary: "Long approved copy.",
      url: githubRepo.html_url,
      year: "2025",
    },
  ], [githubRepo]);

  assert.equal(result.groups["2025"][0].shortSummary, "Short approved copy.");
  assert.equal(result.groups["2025"][0].summary, "Long approved copy.");
  assert.equal(result.groups["2025"][0].createdAt, "2024-03-15T12:00:00Z");
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
