import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { observePublication } from "../lib/publicationObservation";

test("publication observations retain pending events and failures until a newer complete refresh", async () => {
  const directory = await mkdtemp(join(tmpdir(), "publication-observation-"));
  const digest = "a".repeat(64);
  try {
    await observePublication({ kind: "success", startedAt: 1000, digest, projects: 2, stack: 3 }, directory);
    await observePublication({ kind: "event", startedAt: 2000 }, directory);
    await observePublication({ kind: "event", startedAt: 2900 }, directory);
    // A refresh that began before the event must not clear that pending event.
    await observePublication({ kind: "success", startedAt: 1500, digest, projects: 2, stack: 3 }, directory);
    await observePublication({ kind: "failure", startedAt: 3000 }, directory);
    let metrics = await readFile(join(directory, "metrics.prom"), "utf8");
    assert.match(metrics, /website_publication_refresh_failed 1\n/);
    assert.match(metrics, /website_publication_pending_event_timestamp_seconds 2\n/);
    await observePublication({ kind: "success", startedAt: 4000, digest, projects: 0, stack: 3 }, directory);
    await observePublication({ kind: "failure", startedAt: 3500 }, directory);
    metrics = await readFile(join(directory, "metrics.prom"), "utf8");
    assert.match(metrics, /website_publication_refresh_failed 0\n/);
    assert.match(metrics, /website_publication_pending_event_timestamp_seconds 0\n/);
    assert.match(metrics, /website_publication_projects 0\n/);
    assert.equal(metrics.includes(digest), false);
    await assert.rejects(observePublication({ kind: "success", startedAt: 5000, digest: "invalid", projects: 0, stack: 3 }, directory));
    assert.equal(await readFile(join(directory, "metrics.prom"), "utf8"), metrics);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
