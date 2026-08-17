import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createProjectsDiffRoute, fetchGitHubRepos } from "../app/api/projects/diff/route";

const request = new NextRequest("https://mstefan.dev/api/projects/diff");

test("fails closed with a generic 503 response when GitHub repository discovery fails", async () => {
  for (const fetchRepos of [
    () => fetchGitHubRepos(async () => new Response(JSON.stringify({ message: "bad credentials" }), { status: 401 })),
    () => fetchGitHubRepos(async () => new Response(JSON.stringify({ message: "provider error" }), { status: 500 })),
    () => fetchGitHubRepos(async () => { throw new Error("network unavailable"); }),
    () => fetchGitHubRepos(async () => new Response(JSON.stringify({ message: "not a repository list" }))),
  ]) {
    const response = await createProjectsDiffRoute({
      fetchNotionInventory: async () => [],
      fetchRepos,
    })(request);

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "error", count: 0, missing: [] });
  }
});

test("reports a ready zero-count diff for a legitimate empty GitHub repository list", async () => {
  const response = await createProjectsDiffRoute({
    fetchNotionInventory: async () => [],
    fetchRepos: () => fetchGitHubRepos(async () => Response.json([])),
  })(request);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ready", count: 0, missing: [] });
});
