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

export type ProjectPublicationStatus = "ready" | "empty" | "unconfigured" | "error";
export type ProjectPublicationMessage = "empty" | "unconfigured" | "error";

export function resolveProjectPublicationState(
  projects: Project[] | null,
  failed = false,
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
  if (projects.length === 0) {
    return {
      status: "empty",
      projects: [],
      message: "empty",
    };
  }
  return { status: "ready", projects, message: null };
}

export function mergeAndEnrichProjects(
  approved: Project[],
  repos: unknown,
): { groups: Record<string, EnrichedProject[]>; orderedYears: string[] } {
  const repoByUrl = new Map<string, { year?: string; timestamp?: number; createdAt?: string; language?: string }>();

  for (const value of Array.isArray(repos) ? repos : []) {
    if (!value || typeof value !== "object") continue;
    const repo = value as Partial<GitHubRepo>;
    if (typeof repo.html_url !== "string") continue;
    const createdAt = typeof repo.created_at === "string" ? repo.created_at : undefined;
    const timestamp = createdAt ? Date.parse(createdAt) : Number.NaN;
    const hasCreationDate = Number.isFinite(timestamp);
    repoByUrl.set(repo.html_url.toLowerCase(), {
      year: hasCreationDate ? new Date(timestamp).getUTCFullYear().toString() : undefined,
      timestamp: hasCreationDate ? timestamp : undefined,
      createdAt: hasCreationDate ? createdAt : undefined,
      language: typeof repo.language === "string" ? repo.language : undefined,
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
