import Link from "next/link";

import { ProjectCard } from "@/components/ProjectCard";
import { StackCatalog } from "@/components/StackCatalog";
import { loadPublicProjects } from "@/lib/publicProjects";
import { loadWebsiteStack } from "@/lib/websiteStack";

const SELECTED_PROJECTS = ["mstefan-dev", "ai_agents", "PhysIQ"];

export const revalidate = 60;

export default async function Home() {
  const [{ projects, publication }, stackCatalog] = await Promise.all([
    loadPublicProjects(),
    loadWebsiteStack(),
  ]);
  const projectsByTitle = new Map(projects.map((project) => [project.title, project]));
  const selectedProjects = SELECTED_PROJECTS.flatMap((title) => {
    const project = projectsByTitle.get(title);
    return project ? [project] : [];
  });
  const toolkitEntries = stackCatalog.entries.filter((entry) => entry.websiteVisible);
  const toolkitMessage = stackCatalog.message
    ?? (toolkitEntries.length === 0 ? "No Toolkit items are currently approved for website publication." : null);

  return (
    <section className="space-y-10">
      <header className="pt-4">
        <p className="text-sm text-black/60 dark:text-white/60">
          Software engineer · AI systems
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          I build AI systems for real work.
        </h1>
        <p className="mt-4 max-w-prose text-black/70 dark:text-white/70">
          I’m interested in the layer between a capable model and a useful outcome:
          tools, state, permissions, evaluation, and the feedback loops that make the
          system dependable.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/projects"
            className="rounded-xl bg-[hsl(var(--accent))] px-4 py-2 font-medium text-black no-underline hover:opacity-90"
          >
            See projects
          </Link>
          <a
            href="mailto:massimo@mstefan.dev"
            className="rounded-xl border px-4 py-2 font-medium no-underline border-black/15 hover:border-accent dark:border-white/15"
          >
            Get in touch
          </a>
        </div>
      </header>

      <section aria-labelledby="selected-work-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="selected-work-heading" className="text-xl font-semibold">
              Selected work
            </h2>
            <p className="mt-2 text-sm text-black/60 dark:text-white/60">
              A few projects that represent what I build.
            </p>
          </div>
          <Link href="/projects" className="shrink-0 text-sm font-medium">
            View all projects
          </Link>
        </div>

        {selectedProjects.length > 0 ? (
          <div className="mt-4 border-t border-black/10 dark:border-white/10">
            {selectedProjects.map((project) => (
              <ProjectCard
                key={project.title}
                {...project}
                stackCatalog={stackCatalog.entries}
              />
            ))}
          </div>
        ) : publication.message ? (
          <p
            className="mt-4 rounded-xl border border-black/10 bg-black/[0.03] p-4 text-sm text-black/70 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
            role={publication.status === "error" || publication.status === "unconfigured" ? "alert" : "status"}
          >
            {publication.message}
          </p>
        ) : null}
      </section>

      <section
        className="border-y border-black/10 py-5 dark:border-white/10"
        aria-labelledby="toolkit-heading"
      >
        <h2 id="toolkit-heading" className="text-xl font-semibold">
          Toolkit
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-black/60 dark:text-white/60">
          Tools and technologies I use across my work.
        </p>
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
    </section>
  );
}
