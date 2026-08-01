import { ProjectCard } from "@/components/ProjectCard";
import { projects as curatedProjects, type Project } from "@/content/projects";
import { fetchProjectsFromNotion, type NotionProject } from "@/lib/notion";
import { mergeAndEnrichProjects, type GitHubRepo } from "@/lib/projectPublication";
import { loadWebsiteStack } from "@/lib/websiteStack";

export const metadata = { title: "Projects" };

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
  const [repos, notion, stackCatalog] = await Promise.all([
    fetchGitHubRepos(),
    fetchProjectsFromNotion().catch(() => null),
    loadWebsiteStack(),
  ]);

  const hasNotionSource = notion !== null;
  const base: Project[] = hasNotionSource
    ? notion.map((n: NotionProject) => ({
        title: n.title,
        summary: n.summary,
        url: n.url,
        tags: n.tags,
        language: n.language,
        year: n.year,
      }))
    : curatedProjects;

  const { groups, orderedYears } = mergeAndEnrichProjects(base, repos, !hasNotionSource);

  return (
    <section>
      <h1 className="text-2xl font-semibold">Projects</h1>
      <p className="mt-2 text-black/70 dark:text-white/70 text-sm">
        Selected work. Grouped by year.
      </p>

      {orderedYears.map((year) => (
        <div key={year} className="mt-8 first:mt-6">
          <h2 className="text-xl font-semibold">{year}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {groups[year].map((p) => (
              <ProjectCard key={`${year}-${p.title}`} {...p} stackCatalog={stackCatalog} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
