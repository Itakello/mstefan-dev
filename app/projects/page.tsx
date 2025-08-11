import { ProjectCard } from "@/components/ProjectCard";
import { projects as curatedProjects, type Project } from "@/content/projects";
import { fetchProjectsFromNotion, type NotionProject } from "@/lib/notion";

export const metadata = { title: "Projects" };

type GitHubRepo = {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  archived: boolean;
  fork: boolean;
  pushed_at: string; // ISO date string
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
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  // Fix common acronyms/special cases
  for (let i = 0; i < words.length; i += 1) {
    if (words[i] === "Ai") words[i] = "AI";
    if (words[i] === "Llm") words[i] = "LLM";
    if (words[i] === "Tom") words[i] = "TOM";
  }
  return words.join(" ");
}

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

function mergeAndEnrichProjects(
  curated: Project[],
  repos: GitHubRepo[]
): { groups: Record<string, EnrichedProject[]>; orderedYears: string[] } {
  const repoByUrl = new Map<string, { year: string; timestamp: number; language?: string | null }>();
  const repoByName = new Map<string, { year: string; timestamp: number; url: string; language?: string | null; description?: string | null }>();

  // Build maps from ALL repos so curated forks can still be enriched
  for (const r of repos) {
    const year = new Date(r.pushed_at).getFullYear().toString();
    const timestamp = new Date(r.pushed_at).getTime();
    repoByUrl.set(r.html_url.toLowerCase(), { year, timestamp, language: r.language });
    repoByName.set(r.name.toLowerCase(), { year, timestamp, url: r.html_url, language: r.language, description: r.description });
  }

  const seenUrls = new Set<string>();
  const merged: EnrichedProject[] = [];

  // First, take curated projects and enrich with year/timestamp if possible
  for (const p of curated) {
    const urlKey = (p.url || "").toLowerCase();
    const match = urlKey ? repoByUrl.get(urlKey) : undefined;
    // Separate a language tag if present in curated tags
    const curatedLanguageTag = (p.tags || []).find((t) =>
      ["JavaScript", "TypeScript", "Python", "Java", "C++", "C#", "Go", "Rust", "Ruby", "PHP", "Kotlin", "Swift"].includes(t)
    );
    const filteredTags = (p.tags || []).filter((t) => t !== curatedLanguageTag);

    const enriched: EnrichedProject = {
      ...p,
      year: p.year || match?.year,
      // keep non-language tags only
      tags: filteredTags.length > 0 ? filteredTags : undefined,
      language: curatedLanguageTag || (match?.language || undefined) || undefined,
      sortTimestamp: match?.timestamp,
    };
    if (urlKey) seenUrls.add(urlKey);
    merged.push(enriched);
  }

  // Then, add remaining GitHub repos that weren't already curated
  // Exclude archived and forks from auto-listing to keep the list focused
  for (const r of repos.filter((rr) => !rr.archived && !rr.fork)) {
    const urlKey = r.html_url.toLowerCase();
    if (seenUrls.has(urlKey)) continue;
    // Skip the personal readme repo named exactly the username
    if (r.name.toLowerCase() === GITHUB_USER.toLowerCase()) continue;
    const projectFromRepo: EnrichedProject = {
      title: prettifyRepoName(r.name),
      summary: r.description || "",
      url: r.html_url,
      // do not include language in tags
      tags: undefined,
      language: r.language || undefined,
      year: new Date(r.pushed_at).getFullYear().toString(),
      sortTimestamp: new Date(r.pushed_at).getTime(),
    };
    merged.push(projectFromRepo);
  }

  // Group by year and sort within each year by timestamp desc, curated-first if equal
  const groups: Record<string, EnrichedProject[]> = {};
  for (const m of merged) {
    const y = m.year || "Unknown";
    if (!groups[y]) groups[y] = [];
    groups[y].push(m);
  }

  for (const year of Object.keys(groups)) {
    groups[year].sort((a, b) => (b.sortTimestamp || 0) - (a.sortTimestamp || 0));
  }

  const orderedYears = Object.keys(groups)
    .sort((a, b) => {
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return parseInt(b, 10) - parseInt(a, 10);
    });

  return { groups, orderedYears };
}

export default async function ProjectsPage() {
  const [repos, notion] = await Promise.all([
    fetchGitHubRepos(),
    fetchProjectsFromNotion().catch(() => null),
  ]);

  const base: Project[] = (notion && notion.length > 0)
    ? notion.map((n: NotionProject) => ({
        title: n.title,
        summary: n.summary,
        url: n.url,
        tags: n.tags,
        year: n.year,
      }))
    : curatedProjects;

  const { groups, orderedYears } = mergeAndEnrichProjects(base, repos);

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
              <ProjectCard key={`${year}-${p.title}`} {...p} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
