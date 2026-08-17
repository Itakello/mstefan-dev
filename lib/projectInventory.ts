import type { NotionProjectInventory } from "@/lib/notion";

type GitHubInventoryRepository = {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  archived: boolean;
  fork: boolean;
  pushed_at: string;
};

export function findMissingInventoryRepositories(
  inventory: readonly NotionProjectInventory[],
  repos: readonly GitHubInventoryRepository[],
  githubUser: string,
) {
  const inventoryUrls = new Set(
    inventory.map((project) => project.url?.toLowerCase()).filter((url): url is string => Boolean(url)),
  );
  const inventoryTitles = new Set(
    inventory.map((project) => project.title?.trim().toLowerCase()).filter((title): title is string => Boolean(title)),
  );

  return repos
    .filter((repo) => !repo.archived && !repo.fork)
    .filter((repo) => repo.name.toLowerCase() !== githubUser.toLowerCase())
    .filter((repo) => !inventoryUrls.has(repo.html_url.toLowerCase()))
    .filter((repo) => !inventoryTitles.has(repo.name.trim().toLowerCase()))
    .map((repo) => ({
      title: repo.name,
      url: repo.html_url,
      description: repo.description,
      language: repo.language,
      pushed_at: repo.pushed_at,
    }));
}
