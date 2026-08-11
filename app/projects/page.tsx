import { ProjectCard } from "@/components/ProjectCard";
import { fetchProjectsFromNotion, type NotionProject } from "@/lib/notion";
import {
  mergeAndEnrichProjects,
  resolveProjectPublicationState,
  type GitHubRepo,
} from "@/lib/projectPublication";
import { loadWebsiteStack } from "@/lib/websiteStack";

export const metadata = { title: "Projects" };
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
        summary: project.summary,
        url: project.url,
        tags: project.tags,
        language: project.language,
        year: project.year,
      }))
    : null;
  const publication = resolveProjectPublicationState(notionProjects, notionResult.failed);

  const { groups, orderedYears } = mergeAndEnrichProjects(publication.projects, repos);

  return (
    <section>
      <h1 className="text-2xl font-semibold">Projects</h1>
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

      {stackCatalog.message && (
        <p
          className="mt-4 rounded-xl border border-black/10 bg-black/[0.03] p-4 text-sm text-black/70 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
          data-stack-publication-status={stackCatalog.status}
          role={stackCatalog.status === "error" || stackCatalog.status === "unconfigured" ? "alert" : "status"}
        >
          {stackCatalog.message}
        </p>
      )}

      {orderedYears.map((year) => (
        <div key={year} className="mt-8 first:mt-6">
          <h2 className="text-xl font-semibold">{year}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {groups[year].map((p) => (
              <ProjectCard key={`${year}-${p.title}`} {...p} stackCatalog={stackCatalog.entries} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
