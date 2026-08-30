import assert from "node:assert/strict";
import test from "node:test";

import { revalidate as homeRevalidate } from "../app/[locale]/page";
import {
  revalidate as projectsRevalidate
} from "../app/[locale]/projects/page";
import { fetchGitHubRepos } from "../lib/github";
import {
  PUBLICATION_CACHE_TAG,
  PUBLICATION_REVALIDATE_SECONDS,
} from "../lib/publicationCache";

test("uses a daily recovery refresh for event-driven publication", () => {
  assert.equal(PUBLICATION_REVALIDATE_SECONDS, 86_400);
  assert.equal(homeRevalidate, PUBLICATION_REVALIDATE_SECONDS);
  assert.equal(projectsRevalidate, PUBLICATION_REVALIDATE_SECONDS);
});

test("tags GitHub enrichment for webhook invalidation", async () => {
  let requestInit: RequestInit & { next?: { revalidate?: number; tags?: string[] } } | undefined;
  const repositories = await fetchGitHubRepos(async (_input, init) => {
    requestInit = init as typeof requestInit;
    return Response.json([]);
  });

  assert.deepEqual(repositories, []);
  assert.equal(requestInit?.cache, undefined);
  assert.deepEqual(requestInit?.next, {
    revalidate: PUBLICATION_REVALIDATE_SECONDS,
    tags: [PUBLICATION_CACHE_TAG],
  });
});
