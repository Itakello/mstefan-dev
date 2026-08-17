import { NextRequest } from "next/server";
import { GITHUB_USER } from "@/lib/github";
import { fetchProjectInventoryFromNotion } from "@/lib/notion";
import { findMissingInventoryRepositories } from "@/lib/projectInventory";

type GitHubRepo = {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  archived: boolean;
  fork: boolean;
  pushed_at: string | null;
};

function isNonblankString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function isGitHubPushedAt(value: unknown): value is string | null {
  return value === null || (isNonblankString(value) && Number.isFinite(Date.parse(value)));
}

function isGitHubRepo(value: unknown): value is GitHubRepo {
  return Boolean(value)
    && typeof value === "object"
    && isNonblankString((value as GitHubRepo).name)
    && ((value as GitHubRepo).description === null || typeof (value as GitHubRepo).description === "string")
    && isNonblankString((value as GitHubRepo).html_url)
    && ((value as GitHubRepo).language === null || typeof (value as GitHubRepo).language === "string")
    && typeof (value as GitHubRepo).archived === "boolean"
    && typeof (value as GitHubRepo).fork === "boolean"
    && isGitHubPushedAt((value as GitHubRepo).pushed_at);
}

export async function fetchGitHubRepos(fetchImpl: typeof fetch = fetch): Promise<GitHubRepo[]> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const url = `https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`;
  const response = await fetchImpl(url, { headers, next: { revalidate: 60 } });
  if (!response.ok) throw new Error("GitHub repository discovery failed.");

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("GitHub repository discovery returned invalid JSON.");
  }
  if (!Array.isArray(payload) || !payload.every(isGitHubRepo)) {
    throw new Error("GitHub repository discovery returned an invalid repository list.");
  }
  return payload;
}

type ProjectsDiffDependencies = {
  fetchNotionInventory: typeof fetchProjectInventoryFromNotion;
  fetchRepos: typeof fetchGitHubRepos;
};

export function createProjectsDiffRoute({
  fetchNotionInventory = fetchProjectInventoryFromNotion,
  fetchRepos = fetchGitHubRepos,
}: Partial<ProjectsDiffDependencies> = {}) {
  return async function GET(_req: NextRequest) {
    let notion;
    try {
      notion = await fetchNotionInventory();
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

    let repos;
    try {
      repos = await fetchRepos();
    } catch {
      return Response.json(
        { status: "error", count: 0, missing: [] },
        { status: 503 },
      );
    }

    const missing = findMissingInventoryRepositories(notion, repos, GITHUB_USER);

    return Response.json({ status: "ready", count: missing.length, missing });
  };
}

export const GET = createProjectsDiffRoute();
