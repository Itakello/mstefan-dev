import assert from "node:assert/strict";
import test from "node:test";

import { dynamic as homeDynamic, revalidate as homeRevalidate } from "../app/[locale]/page";
import {
  dynamic as projectsDynamic,
  revalidate as projectsRevalidate
} from "../app/[locale]/projects/page";
import { fetchGitHubRepos } from "../lib/github";

test("publishes Home, projects, and Toolkit only from a deployment build", () => {
  assert.equal(homeDynamic, "error");
  assert.equal(projectsDynamic, "error");
  assert.equal(homeRevalidate, false);
  assert.equal(projectsRevalidate, false);
});

test("keeps GitHub project enrichment in the deployment cache", async () => {
  let requestInit: RequestInit | undefined;
  const repositories = await fetchGitHubRepos(async (_input, init) => {
    requestInit = init;
    return Response.json([]);
  });

  assert.deepEqual(repositories, []);
  assert.equal(requestInit?.cache, "force-cache");
  assert.equal("next" in (requestInit ?? {}), false);
});
