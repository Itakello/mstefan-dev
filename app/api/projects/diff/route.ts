import { NextRequest } from "next/server";
import { projects as curatedProjects } from "@/content/projects";
import { fetchProjectsFromNotion } from "@/lib/notion";

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
  const [repos, notion] = await Promise.all([
    fetchGitHubRepos(),
    fetchProjectsFromNotion().catch(() => null),
  ]);

  const siteUrls = new Set(
    (notion && notion.length > 0 ? notion : curatedProjects)
      .map((p) => (p.url || "").toLowerCase())
      .filter(Boolean)
  );

  const missing = repos
    .filter((r) => !r.archived && !r.fork)
    .filter((r) => r.name.toLowerCase() !== GITHUB_USER.toLowerCase())
    .filter((r) => !siteUrls.has(r.html_url.toLowerCase()))
    .map((r) => ({
      title: r.name,
      url: r.html_url,
      description: r.description,
      language: r.language,
      pushed_at: r.pushed_at,
    }));

  return new Response(JSON.stringify({ count: missing.length, missing }), {
    headers: { "content-type": "application/json" },
  });
}


