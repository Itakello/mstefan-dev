import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeAndEnrichProjects,
  resolveProjectPublicationState,
  selectPublicProjects,
} from "../lib/projectPublication";
import { projectPublicationMessage } from "../lib/i18n/copy";

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

test("publishes only active original repositories and excludes the profile repository", () => {
  const approved = [
    { title: "active", summary: "Active.", url: githubRepo.html_url },
    { title: "archived", summary: "Archived.", url: `${githubRepo.html_url}-archived` },
    { title: "fork", summary: "Fork.", url: `${githubRepo.html_url}-fork` },
    { title: "profile", summary: "Profile.", url: `${githubRepo.html_url}-profile` },
  ];
  const repos = [
    { ...githubRepo, name: "active" },
    { ...githubRepo, name: "archived", html_url: approved[1].url!, archived: true },
    { ...githubRepo, name: "fork", html_url: approved[2].url!, fork: true },
    { ...githubRepo, name: "Itakello", html_url: approved[3].url! },
  ];

  assert.deepEqual(selectPublicProjects(approved, repos, "Itakello"), [approved[0]]);
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

test("returns stable fail-closed publication status codes", () => {
  assert.deepEqual(resolveProjectPublicationState(null), {
    status: "unconfigured",
    projects: [],
    message: "unconfigured",
  });
  assert.deepEqual(resolveProjectPublicationState([]), {
    status: "empty",
    projects: [],
    message: "empty",
  });
  assert.deepEqual(resolveProjectPublicationState(null, true), {
    status: "error",
    projects: [],
    message: "error",
  });
});

test("maps project publication statuses to locale-owned messages", () => {
  assert.equal(projectPublicationMessage("en", "empty"), "No projects are currently approved for publication.");
  assert.equal(projectPublicationMessage("it", "empty"), "Nessun progetto è attualmente approvato per la pubblicazione.");
  assert.equal(projectPublicationMessage("it", "error"), "I progetti non sono temporaneamente disponibili perché la fonte di pubblicazione non può essere caricata.");
});
