export type Project = {
  title: string;
  shortSummary?: string;
  summary: string;
  year?: string;
  url?: string;
  tags?: string[];
  language?: string;
  featured?: boolean;
};

export type GitHubRepo = {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  archived: boolean;
  fork: boolean;
  pushed_at: string;
  created_at?: string;
};

type EnrichedProject = Project & {
  sortTimestamp?: number;
  language?: string;
  createdAt?: string;
};

export type ProjectPublicationStatus = "ready" | "empty" | "unconfigured" | "stale" | "error";
export type ProjectPublicationMessage = "empty" | "no-active" | "unconfigured" | "stale" | "error";

export function resolveProjectPublicationState(
  projects: Project[] | null,
  failed = false,
  stale = false,
): { status: ProjectPublicationStatus; projects: Project[]; message: ProjectPublicationMessage | null } {
  if (failed) {
    return {
      status: "error",
      projects: [],
      message: "error",
    };
  }
  if (projects === null) {
    return {
      status: "unconfigured",
      projects: [],
      message: "unconfigured",
    };
  }
  if (stale) {
    return {
      status: "stale",
      projects: [],
      message: "stale",
    };
  }
  if (projects.length === 0) {
    return {
      status: "empty",
      projects: [],
      message: "empty",
    };
  }
  return { status: "ready", projects, message: null };
}

export function selectPublicProjects(
  approved: Project[],
  repos: GitHubRepo[],
  githubUser: string,
): Project[] {
  const publicRepositoryUrls = new Set(
    repos
      .filter((repo) => !repo.archived && !repo.fork)
      .filter((repo) => repo.name.toLowerCase() !== githubUser.toLowerCase())
      .map((repo) => repo.html_url.toLowerCase()),
  );

  return approved.filter((project) =>
    project.url ? publicRepositoryUrls.has(project.url.toLowerCase()) : false,
  );
}

export function mergeAndEnrichProjects(
  approved: Project[],
  repos: GitHubRepo[],
): { groups: Record<string, EnrichedProject[]>; orderedYears: string[] } {
  const repoByUrl = new Map<string, { year?: string; timestamp?: number; language?: string | null; createdAt?: string }>();

  for (const repo of repos) {
    const timestamp = repo.created_at ? Date.parse(repo.created_at) : Number.NaN;
    const hasCreationDate = Number.isFinite(timestamp);
    repoByUrl.set(repo.html_url.toLowerCase(), {
      year: hasCreationDate ? new Date(timestamp).getUTCFullYear().toString() : undefined,
      timestamp: hasCreationDate ? timestamp : undefined,
      language: repo.language,
      createdAt: hasCreationDate ? repo.created_at : undefined,
    });
  }

  const merged: EnrichedProject[] = [];

  for (const project of approved) {
    const urlKey = (project.url || "").toLowerCase();
    const match = urlKey ? repoByUrl.get(urlKey) : undefined;
    const curatedLanguageTag = (project.tags || []).find((tag) =>
      ["JavaScript", "TypeScript", "Python", "Java", "C++", "C#", "Go", "Rust", "Ruby", "PHP", "Kotlin", "Swift"].includes(tag),
    );
    const filteredTags = (project.tags || []).filter((tag) => tag !== curatedLanguageTag);

    merged.push({
      ...project,
      year: match?.year,
      tags: filteredTags.length > 0 ? filteredTags : undefined,
      language: project.language || curatedLanguageTag || match?.language || undefined,
      createdAt: match?.createdAt,
      sortTimestamp: match?.timestamp,
    });
  }

  const groups: Record<string, EnrichedProject[]> = {};
  for (const project of merged) {
    const year = project.year || "Unknown";
    if (!groups[year]) groups[year] = [];
    groups[year].push(project);
  }

  for (const year of Object.keys(groups)) {
    groups[year].sort((left, right) =>
      (right.sortTimestamp || 0) - (left.sortTimestamp || 0)
      || left.title.localeCompare(right.title),
    );
  }

  const orderedYears = Object.keys(groups).sort((left, right) => {
    if (left === "Unknown") return 1;
    if (right === "Unknown") return -1;
    return parseInt(right, 10) - parseInt(left, 10);
  });

  return { groups, orderedYears };
}
