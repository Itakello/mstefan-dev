import type { NotionProjectInventory } from "@/lib/notion";

type GitHubInventoryRepository = {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  archived: boolean;
  fork: boolean;
  pushed_at: string | null;
};

export function findMissingInventoryRepositories(
  inventory: readonly NotionProjectInventory[],
  repos: readonly GitHubInventoryRepository[],
  githubUser: string,
) {
  const inventoryUrls = new Set(
    inventory.map((project) => normalizeUrl(project.url)).filter((url): url is string => Boolean(url)),
  );
  const inventoryTitles = new Set(
    inventory
      .filter((project) => !normalizeUrl(project.url))
      .map((project) => normalizeTitle(project.title))
      .filter((title): title is string => Boolean(title)),
  );

  return repos
    .filter((repo) => !repo.archived && !repo.fork)
    .filter((repo) => repo.name.toLowerCase() !== githubUser.toLowerCase())
    .filter((repo) => !inventoryUrls.has(normalizeUrl(repo.html_url)!))
    .filter((repo) => !inventoryTitles.has(normalizeTitle(repo.name)!))
    .map((repo) => ({
      title: repo.name,
      url: repo.html_url,
      description: repo.description,
      language: repo.language,
      pushed_at: repo.pushed_at,
    }));
}

function normalizeUrl(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized?.endsWith("/") ? normalized.slice(0, -1) : normalized || undefined;
}

function normalizeTitle(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}
