import type { GitHubRepo } from "@/lib/projectPublication";

export const GITHUB_USER = "Itakello";

export async function fetchGitHubRepos(fetchImpl: typeof fetch = fetch): Promise<GitHubRepo[] | null> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const url = `https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`;
  const response = await fetchImpl(url, { cache: "force-cache", headers });
  if (!response.ok) return null;

  return (await response.json()) as GitHubRepo[];
}
