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

test("groups and orders approved projects by repository creation date without changing their copy", () => {
  const newerRepo = {
    ...githubRepo,
    name: "newer",
    html_url: "https://github.com/Itakello/newer",
    created_at: "2025-01-20T08:00:00Z",
    pushed_at: "2025-02-01T00:00:00Z",
  };
  const unmatchedUrl = "https://github.com/Itakello/missing";
  const result = mergeAndEnrichProjects([
    {
      title: "example",
      shortSummary: "Short approved copy.",
      summary: "Long approved copy.",
      url: githubRepo.html_url,
      year: "2030",
    },
    {
      title: "newer",
      summary: "Newer project.",
      url: newerRepo.html_url,
      year: "2020",
    },
    {
      title: "unmatched",
      summary: "No repository creation date.",
      url: unmatchedUrl,
      year: "2026",
    },
  ], [githubRepo, newerRepo]);

  assert.deepEqual(result.orderedYears, ["2025", "2024", "Unknown"]);
  assert.equal(result.groups["2025"][0].title, "newer");
  assert.equal(result.groups["2024"][0].shortSummary, "Short approved copy.");
  assert.equal(result.groups["2024"][0].summary, "Long approved copy.");
  assert.equal(result.groups["2024"][0].createdAt, "2024-03-15T12:00:00Z");
  assert.equal(result.groups.Unknown[0].title, "unmatched");
});

test("orders projects within a year by creation date, not last push date", () => {
  const newestCreation = {
    ...githubRepo,
    name: "newest-creation",
    html_url: "https://github.com/Itakello/newest-creation",
    created_at: "2024-11-01T00:00:00Z",
    pushed_at: "2024-11-02T00:00:00Z",
  };
  const newestPush = {
    ...githubRepo,
    name: "newest-push",
    html_url: "https://github.com/Itakello/newest-push",
    created_at: "2024-02-01T00:00:00Z",
    pushed_at: "2026-08-01T00:00:00Z",
  };

  const result = mergeAndEnrichProjects([
    { title: "newest push", summary: "Older creation.", url: newestPush.html_url },
    { title: "newest creation", summary: "Newer creation.", url: newestCreation.html_url },
  ], [newestPush, newestCreation]);

  assert.deepEqual(result.groups["2024"].map((project) => project.title), [
    "newest creation",
    "newest push",
  ]);
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
