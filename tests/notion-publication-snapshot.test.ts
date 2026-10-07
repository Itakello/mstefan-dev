import assert from "node:assert/strict";
import test from "node:test";

import type { NotionProject } from "../lib/notion";
import { loadNotionPublicationSnapshot, refreshNotionPublicationSnapshot } from "../lib/notionPublicationSnapshot";
import { observePublication } from "../lib/publicationObservation";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StackEntry } from "../lib/stack";

const projects: NotionProject[] = [{
  title: "Example",
  copy: { en: { summary: "English" }, it: { summary: "Italiano" } },
  tags: ["TypeScript"],
  language: "TypeScript",
  status: "Added",
}];
const stack: StackEntry[] = [{ name: "TypeScript", category: "Language", iconKey: "logos:typescript-icon" }];

test("publishes one validated Projects and Stack snapshot", async () => {
  let validated: readonly StackEntry[] | undefined;
  const snapshot = await loadNotionPublicationSnapshot({
    fetchProjects: async () => projects,
    fetchStack: async () => stack,
    validateIcons: async (entries) => { validated = entries; },
  });

  assert.deepEqual(snapshot, {
    projects,
    stack,
    digest: snapshot.digest,
    checkedAt: snapshot.checkedAt,
  });
  assert.match(snapshot.digest, /^[a-f0-9]{64}$/);
  assert.equal(Number.isFinite(snapshot.checkedAt), true);
  assert.deepEqual(validated, stack);
});

test("rejects the entire snapshot when either Notion source is unavailable", async () => {
  await assert.rejects(loadNotionPublicationSnapshot({
    fetchProjects: async () => null,
    fetchStack: async () => stack,
    validateIcons: async () => {},
  }), /Projects source is unavailable/);
  await assert.rejects(loadNotionPublicationSnapshot({
    fetchProjects: async () => projects,
    fetchStack: async () => null,
    validateIcons: async () => {},
  }), /Stack source is unavailable or empty/);
});

test("does not return the snapshot when project-stack coverage or icon validation fails", async () => {
  await assert.rejects(loadNotionPublicationSnapshot({
    fetchProjects: async () => [{ ...projects[0], tags: ["Unlisted"] }],
    fetchStack: async () => stack,
    validateIcons: async () => {},
  }), /missing Stack entries/);
  await assert.rejects(loadNotionPublicationSnapshot({
    fetchProjects: async () => projects,
    fetchStack: async () => stack,
    validateIcons: async () => { throw new Error("icon unavailable"); },
  }), /icon unavailable/);
});

test("allows an empty approved Projects result so withdrawals are published", async () => {
  const snapshot = await loadNotionPublicationSnapshot({
    fetchProjects: async () => [],
    fetchStack: async () => stack,
    validateIcons: async () => {},
  });

  assert.deepEqual(snapshot.projects, []);
});

test("rejects a source snapshot superseded by a signed event during refresh", async () => {
  const directory = await mkdtemp(join(tmpdir(), "publication-race-"));
  const previous = process.env.PAYLOAD_DATA_DIR;
  process.env.PAYLOAD_DATA_DIR = directory;
  try {
    await assert.rejects(refreshNotionPublicationSnapshot({
      fetchProjects: async () => {
        await observePublication({ kind: "event" });
        return projects;
      },
      fetchStack: async () => stack,
      validateIcons: async () => {},
    }), /Notion changed during publication refresh/);
    const metrics = await readFile(join(directory, "publication-health", "metrics.prom"), "utf8");
    assert.match(metrics, /website_publication_refresh_failed 1\n/);
    assert.match(metrics, /website_publication_last_success_timestamp_seconds 0\n/);
  } finally {
    if (previous === undefined) delete process.env.PAYLOAD_DATA_DIR;
    else process.env.PAYLOAD_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
