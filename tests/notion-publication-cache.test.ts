import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const runtime = globalThis as typeof globalThis & {
  AsyncLocalStorage?: typeof AsyncLocalStorage;
  __incrementalCache?: unknown;
};
runtime.AsyncLocalStorage = AsyncLocalStorage;
const { default: cache } = await import("next/cache.js");
const { loadNotionPublicationSnapshot, refreshNotionPublicationSnapshot } = await import("../lib/notionPublicationSnapshot");
const { observePublication } = await import("../lib/publicationObservation");

test("a signed event during source loading cannot cache superseded publication data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "publication-cache-race-"));
  const previousDirectory = process.env.PAYLOAD_DATA_DIR;
  const previousCache = runtime.__incrementalCache;
  const entries = new Map<string, { value: unknown; isStale: false }>();
  process.env.PAYLOAD_DATA_DIR = directory;
  runtime.__incrementalCache = {
    generateSimpleCacheKey: async (key: string) => key,
    get: async (key: string) => entries.get(key) ?? null,
    set: async (key: string, value: unknown) => { entries.set(key, { value, isStale: false }); },
  };
  let reads = 0;
  const loadSnapshot = cache.unstable_cache(() => loadNotionPublicationSnapshot({
    fetchProjects: async () => {
      reads++;
      if (reads === 1) await observePublication({ kind: "event" });
      return [];
    },
    fetchStack: async () => [{ name: "TypeScript", category: "Language", iconKey: "logos:typescript-icon" }],
  }), ["publication-race-test"]);
  try {
    await assert.rejects(refreshNotionPublicationSnapshot({ loadSnapshot, validateIcons: async () => {} }), /Notion changed/);
    assert.equal(entries.size, 0);
    await refreshNotionPublicationSnapshot({ loadSnapshot, validateIcons: async () => {} });
    assert.equal(reads, 2, "The next request must reread Notion instead of publishing the superseded result");
  } finally {
    runtime.__incrementalCache = previousCache;
    if (previousDirectory === undefined) delete process.env.PAYLOAD_DATA_DIR;
    else process.env.PAYLOAD_DATA_DIR = previousDirectory;
    await rm(directory, { recursive: true, force: true });
  }
});
