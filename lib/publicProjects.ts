import { fetchGitHubRepos, GITHUB_USER } from "@/lib/github";
import type { Locale } from "@/lib/i18n/config";
import { fetchProjectsFromNotion, type NotionProject } from "@/lib/notion";
import {
  mergeAndEnrichProjects,
  resolveProjectPublicationState,
  selectPublicProjects,
} from "@/lib/projectPublication";

type PublicProjectsLoaderOptions = {
  fetchProjects?: typeof fetchProjectsFromNotion;
  fetchRepos?: typeof fetchGitHubRepos;
  vercelEnv?: string;
};

export function selectPublicProjectLocale(project: NotionProject, locale: Locale) {
  const localizedCopy = project.copy[locale];

  return {
    title: project.title,
    summary: localizedCopy.summary,
    ...(localizedCopy.shortSummary ? { shortSummary: localizedCopy.shortSummary } : {}),
    ...(project.url ? { url: project.url } : {}),
    ...(project.tags ? { tags: project.tags } : {}),
    ...(project.language ? { language: project.language } : {}),
  };
}

export async function loadPublicProjects(
  locale: Locale,
  {
    fetchProjects = fetchProjectsFromNotion,
    fetchRepos = fetchGitHubRepos,
    vercelEnv = process.env.VERCEL_ENV,
  }: PublicProjectsLoaderOptions = {},
) {
  const [repos, notionResult] = await Promise.all([
    fetchRepos().catch((error) => {
      console.error("Failed to load GitHub repository eligibility data.", error);
      return null;
    }),
    fetchProjects()
      .then((projects) => ({ projects, failed: false }))
      .catch((error) => {
        console.error("Failed to load the Notion project publication source.", error);
        return { projects: null, failed: true };
      }),
  ]);

  if (vercelEnv === "production" && (
    repos === null
    || notionResult.failed
    || notionResult.projects === null
  )) {
    throw new Error("Cannot publish without valid Notion Projects and GitHub data");
  }

  const notionProjects = notionResult.projects
    ? notionResult.projects.map((project: NotionProject) => selectPublicProjectLocale(project, locale))
    : null;
  const publication = resolveProjectPublicationState(
    notionProjects,
    notionResult.failed,
    repos === null,
  );
  const projects = repos
    ? selectPublicProjects(publication.projects, repos, GITHUB_USER)
    : [];
  const published = publication.status === "ready" && projects.length === 0
    ? {
        status: "empty" as const,
        projects,
        message: "no-active" as const,
      }
    : { ...publication, projects };
  const { groups, orderedYears } = mergeAndEnrichProjects(projects, repos ?? []);

  return {
    groups,
    orderedYears,
    projects: orderedYears.flatMap((year) => groups[year]),
    publication: published,
  };
}
