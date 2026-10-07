import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";

import { fetchProjectsFromNotion, fetchStackFromNotion, type NotionProject } from "@/lib/notion";
import { PUBLICATION_CACHE_TAG, PUBLICATION_REVALIDATE_SECONDS } from "@/lib/publicationCache";
import { assertProjectStackCoverage, type StackEntry } from "@/lib/stack";
import { approvedWebsiteUrls } from "@/lib/websiteShowcase";
import { validateStackIcons } from "@/lib/websiteStack";
import { publicationGeneration, safelyObservePublication } from "@/lib/publicationObservation";

export type NotionPublicationSnapshot = {
  projects: NotionProject[];
  stack: StackEntry[];
  digest: string;
  checkedAt: number;
};

type SnapshotOptions = {
  fetchProjects?: () => Promise<NotionProject[] | null>;
  fetchStack?: () => Promise<StackEntry[] | null>;
  validateIcons?: (entries: readonly StackEntry[]) => Promise<void>;
};

export async function loadNotionPublicationSnapshot({
  fetchProjects = fetchProjectsFromNotion,
  fetchStack = fetchStackFromNotion,
  validateIcons = validateStackIcons,
}: SnapshotOptions = {}): Promise<NotionPublicationSnapshot> {
  const [projects, stack] = await Promise.all([fetchProjects(), fetchStack()]);
  if (projects === null) throw new Error("Notion Projects source is unavailable");
  if (stack === null || stack.length === 0) throw new Error("Notion Stack source is unavailable or empty");

  approvedWebsiteUrls(projects);
  assertProjectStackCoverage(projects, stack);
  await validateIcons(stack);
  const digest = createHash("sha256").update(JSON.stringify({ projects, stack })).digest("hex");
  return { projects, stack, digest, checkedAt: Date.now() };
}

export async function refreshNotionPublicationSnapshot(options: SnapshotOptions = {}) {
  const startedAt = Date.now();
  const generation = publicationGeneration();
  try {
    const snapshot = await loadNotionPublicationSnapshot(options);
    if (generation !== publicationGeneration()) throw new Error("Notion changed during publication refresh");
    snapshot.checkedAt = startedAt;
    await safelyObservePublication({ kind: "success", startedAt, digest: snapshot.digest,
      projects: snapshot.projects.length, stack: snapshot.stack.length });
    if (generation !== publicationGeneration()) throw new Error("Notion changed during publication refresh");
    return snapshot;
  } catch (error) {
    await safelyObservePublication({ kind: "failure", startedAt });
    throw error;
  }
}

const loadCachedSnapshot = unstable_cache(
  () => refreshNotionPublicationSnapshot(),
  ["notion-publication-snapshot-v1", createHash("sha256").update(JSON.stringify([
    process.env.NOTION_DATABASE_ID, process.env.NOTION_STACK_DATABASE_ID, process.env.NOTION_TOKEN,
  ])).digest("hex")],
  { revalidate: PUBLICATION_REVALIDATE_SECONDS, tags: [PUBLICATION_CACHE_TAG] },
);

export function getNotionPublicationSnapshot() {
  return loadCachedSnapshot();
}
