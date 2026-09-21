import { publicationEnvironment } from "@/lib/publicationEnvironment";
import { fetchGitHubRepos } from "@/lib/github";
import type { Locale } from "@/lib/i18n/config";
import { fetchProjectsFromNotion, type NotionProject } from "@/lib/notion";
import {
  mergeAndEnrichProjects,
  resolveProjectPublicationState,
} from "@/lib/projectPublication";

type PublicProjectsLoaderOptions = {
  fetchProjects?: typeof fetchProjectsFromNotion;
  fetchRepos?: typeof fetchGitHubRepos;
  vercelEnv?: string;
};

const GITHUB_ENRICHMENT_TIMEOUT_MS = 3_000;

async function loadGitHubEnrichment(fetchRepos: typeof fetchGitHubRepos) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetchRepos(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), GITHUB_ENRICHMENT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function selectPublicProjectLocale(project: NotionProject, locale: Locale) {
  const localizedCopy = project.copy[locale];

  return {
    title: project.title,
    summary: localizedCopy.summary,
    ...(localizedCopy.shortSummary ? { shortSummary: localizedCopy.shortSummary } : {}),
    ...(project.url ? { url: project.url } : {}),
    ...(project.tags ? { tags: project.tags } : {}),
    ...(project.year ? { year: project.year } : {}),
    ...(project.language ? { language: project.language } : {}),
  };
}

export async function loadPublicProjects(
  locale: Locale,
  {
    fetchProjects = fetchProjectsFromNotion,
    fetchRepos = fetchGitHubRepos,
    vercelEnv = publicationEnvironment(),
  }: PublicProjectsLoaderOptions = {},
) {
  const [repos, notionResult] = await Promise.all([
    loadGitHubEnrichment(fetchRepos).catch((error) => {
      console.error("Failed to load GitHub repository enrichment data.", error);
      return null;
    }),
    fetchProjects()
      .then((projects) => ({ projects, failed: false }))
      .catch((error) => {
        console.error("Failed to load the Notion project publication source.", error);
        return { projects: null, failed: true };
      }),
  ]);

  if (vercelEnv === "production" && (notionResult.failed || notionResult.projects === null)) {
    throw new Error("Cannot publish without valid Notion Projects data");
  }

  const notionProjects = notionResult.projects
    ? notionResult.projects.map((project: NotionProject) => selectPublicProjectLocale(project, locale))
    : null;
  const publication = resolveProjectPublicationState(
    notionProjects,
    notionResult.failed,
  );
  const { groups, orderedYears } = mergeAndEnrichProjects(publication.projects, repos ?? []);

  return {
    groups,
    orderedYears,
    projects: orderedYears.flatMap((year) => groups[year]),
    publication,
  };
}
