import { fetchGitHubRepos, GITHUB_USER } from "@/lib/github";
import { fetchProjectsFromNotion, type NotionProject } from "@/lib/notion";
import {
  mergeAndEnrichProjects,
  resolveProjectPublicationState,
  selectPublicProjects,
} from "@/lib/projectPublication";

export async function loadPublicProjects() {
  const [repos, notionResult] = await Promise.all([
    fetchGitHubRepos(),
    fetchProjectsFromNotion()
      .then((projects) => ({ projects, failed: false }))
      .catch((error) => {
        console.error("Failed to load the Notion project publication source.", error);
        return { projects: null, failed: true };
      }),
  ]);

  const notionProjects = notionResult.projects
    ? notionResult.projects.map((project: NotionProject) => ({
        title: project.title,
        shortSummary: project.shortSummary,
        summary: project.summary,
        url: project.url,
        tags: project.tags,
        language: project.language,
      }))
    : null;
  const publication = resolveProjectPublicationState(
    notionProjects,
    notionResult.failed || repos === null,
  );
  const projects = repos
    ? selectPublicProjects(publication.projects, repos, GITHUB_USER)
    : [];
  const published = publication.status === "ready" && projects.length === 0
    ? {
        status: "empty" as const,
        projects,
        message: "No active public projects are currently approved for publication.",
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
