import { NextRequest } from "next/server";
import { fetchProjectInventoryFromNotion } from "@/lib/notion";
import { findMissingInventoryRepositories } from "@/lib/projectInventory";

type GitHubRepo = {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  archived: boolean;
  fork: boolean;
  pushed_at: string;
};

const GITHUB_USER = "Itakello";

async function fetchGitHubRepos(): Promise<GitHubRepo[]> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const url = `https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`;
  const res = await fetch(url, { headers, next: { revalidate: 60 } });
  if (!res.ok) return [];
  return (await res.json()) as GitHubRepo[];
}

export async function GET(_req: NextRequest) {
  let notion;
  try {
    notion = await fetchProjectInventoryFromNotion();
  } catch {
    return Response.json(
      { status: "error", count: 0, missing: [] },
      { status: 503 },
    );
  }

  if (notion === null) {
    return Response.json(
      { status: "unconfigured", count: 0, missing: [] },
      { status: 503 },
    );
  }

  const repos = await fetchGitHubRepos();

  const missing = findMissingInventoryRepositories(notion, repos, GITHUB_USER);

  return Response.json({ status: "ready", count: missing.length, missing });
}
