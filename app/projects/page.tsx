import { ProjectCard } from "@/components/ProjectCard";
import { ProjectLayoutGroup, ProjectLayoutItem } from "@/components/ProjectLayoutGroup";
import { StackCatalog } from "@/components/StackCatalog";
import { fetchProjectsFromNotion, type NotionProject } from "@/lib/notion";
import {
  mergeAndEnrichProjects,
  resolveProjectPublicationState,
  type GitHubRepo,
} from "@/lib/projectPublication";
import { loadWebsiteStack } from "@/lib/websiteStack";

export const metadata = { title: "Work" };
export const revalidate = 60;

const GITHUB_USER = "Itakello";

async function fetchGitHubRepos(): Promise<GitHubRepo[]> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const url = `https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`;
  const res = await fetch(url, { headers, next: { revalidate: 3600 } });
  if (!res.ok) {
    // Gracefully handle rate limits or errors by returning an empty list
    return [];
  }
  const data = (await res.json()) as GitHubRepo[];
  return data;
}

export default async function ProjectsPage() {
  const [repos, notionResult, stackCatalog] = await Promise.all([
    fetchGitHubRepos(),
    fetchProjectsFromNotion()
      .then((projects) => ({ projects, failed: false }))
      .catch((error) => {
        console.error("Failed to load the Notion project publication source.", error);
        return { projects: null, failed: true };
      }),
    loadWebsiteStack(),
  ]);

  const notionProjects = notionResult.projects
    ? notionResult.projects.map((project: NotionProject) => ({
        title: project.title,
        shortSummary: project.shortSummary,
        summary: project.summary,
        url: project.url,
        tags: project.tags,
        language: project.language,
        year: project.year,
      }))
    : null;
  const publication = resolveProjectPublicationState(notionProjects, notionResult.failed);

  const { groups, orderedYears } = mergeAndEnrichProjects(publication.projects, repos);
  const toolkitEntries = stackCatalog.entries.filter((entry) => entry.websiteVisible);
  const toolkitMessage = stackCatalog.message
    ?? (toolkitEntries.length === 0 ? "No Toolkit items are currently approved for website publication." : null);

  return (
    <section>
      <h1 className="text-2xl font-semibold">Work</h1>
      <p className="mt-2 text-black/70 dark:text-white/70 text-sm">
        Selected work. Grouped by year.
      </p>

      {publication.message && (
        <p
          className="mt-6 rounded-xl border border-black/10 bg-black/[0.03] p-4 text-sm text-black/70 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
          data-project-publication-status={publication.status}
          role={publication.status === "error" || publication.status === "unconfigured" ? "alert" : "status"}
        >
          {publication.message}
        </p>
      )}

      <ProjectLayoutGroup>
        {orderedYears.map((year, yearIndex) => (
          <ProjectLayoutItem key={year} className="mt-8 first:mt-6">
            <h2 className="text-xl font-semibold">{year}</h2>
            <div className="mt-3 border-t border-black/10 dark:border-white/10">
              {groups[year].map((p, projectIndex) => (
                <ProjectCard
                  key={`${year}-${p.title}`}
                  {...p}
                  stackCatalog={stackCatalog.entries}
                  defaultOpen={yearIndex === 0 && projectIndex === 0}
                />
              ))}
            </div>
          </ProjectLayoutItem>
        ))}

        <ProjectLayoutItem className="mt-10">
          <section className="border-y border-black/10 py-5 dark:border-white/10">
            <div>
              <h2 className="text-xl font-semibold">Toolkit</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-black/60 dark:text-white/60">
                Tools and technologies I use across my work.
              </p>
            </div>
            <div className="mt-4">
              {toolkitMessage ? (
                <p
                  className="rounded-lg border border-black/10 bg-black/[0.025] p-4 text-sm text-black/65 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/65"
                  data-stack-publication-status={stackCatalog.status}
                  role={stackCatalog.status === "error" || stackCatalog.status === "unconfigured" ? "alert" : "status"}
                >
                  {toolkitMessage}
                </p>
              ) : (
                <StackCatalog entries={toolkitEntries} />
              )}
            </div>
          </section>
        </ProjectLayoutItem>
      </ProjectLayoutGroup>
    </section>
  );
}
