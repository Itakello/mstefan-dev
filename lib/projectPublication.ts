import type { Project } from "@/content/projects";

export type GitHubRepo = {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  archived: boolean;
  fork: boolean;
  pushed_at: string;
};

type EnrichedProject = Project & {
  sortTimestamp?: number;
  language?: string;
};

const GITHUB_USER = "Itakello";

function prettifyRepoName(name: string): string {
  const words = name
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

  for (let index = 0; index < words.length; index += 1) {
    if (words[index] === "Ai") words[index] = "AI";
    if (words[index] === "Llm") words[index] = "LLM";
    if (words[index] === "Tom") words[index] = "TOM";
  }
  return words.join(" ");
}

export function mergeAndEnrichProjects(
  curated: Project[],
  repos: GitHubRepo[],
  includeUnapprovedGitHubRepos = true,
): { groups: Record<string, EnrichedProject[]>; orderedYears: string[] } {
  const repoByUrl = new Map<string, { year: string; timestamp: number; language?: string | null }>();

  for (const repo of repos) {
    const year = new Date(repo.pushed_at).getFullYear().toString();
    const timestamp = new Date(repo.pushed_at).getTime();
    repoByUrl.set(repo.html_url.toLowerCase(), { year, timestamp, language: repo.language });
  }

  const seenUrls = new Set<string>();
  const merged: EnrichedProject[] = [];

  for (const project of curated) {
    const urlKey = (project.url || "").toLowerCase();
    const match = urlKey ? repoByUrl.get(urlKey) : undefined;
    const curatedLanguageTag = (project.tags || []).find((tag) =>
      ["JavaScript", "TypeScript", "Python", "Java", "C++", "C#", "Go", "Rust", "Ruby", "PHP", "Kotlin", "Swift"].includes(tag),
    );
    const filteredTags = (project.tags || []).filter((tag) => tag !== curatedLanguageTag);

    merged.push({
      ...project,
      year: project.year || match?.year,
      tags: filteredTags.length > 0 ? filteredTags : undefined,
      language: project.language || curatedLanguageTag || match?.language || undefined,
      sortTimestamp: match?.timestamp,
    });
    if (urlKey) seenUrls.add(urlKey);
  }

  for (const repo of includeUnapprovedGitHubRepos
    ? repos.filter((candidate) => !candidate.archived && !candidate.fork)
    : []) {
    const urlKey = repo.html_url.toLowerCase();
    if (seenUrls.has(urlKey) || repo.name.toLowerCase() === GITHUB_USER.toLowerCase()) continue;

    merged.push({
      title: prettifyRepoName(repo.name),
      summary: repo.description || "",
      url: repo.html_url,
      tags: undefined,
      language: repo.language || undefined,
      year: new Date(repo.pushed_at).getFullYear().toString(),
      sortTimestamp: new Date(repo.pushed_at).getTime(),
    });
  }

  const groups: Record<string, EnrichedProject[]> = {};
  for (const project of merged) {
    const year = project.year || "Unknown";
    if (!groups[year]) groups[year] = [];
    groups[year].push(project);
  }

  for (const year of Object.keys(groups)) {
    groups[year].sort((left, right) => (right.sortTimestamp || 0) - (left.sortTimestamp || 0));
  }

  const orderedYears = Object.keys(groups).sort((left, right) => {
    if (left === "Unknown") return 1;
    if (right === "Unknown") return -1;
    return parseInt(right, 10) - parseInt(left, 10);
  });

  return { groups, orderedYears };
}
