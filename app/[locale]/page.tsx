import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectCard } from "@/components/ProjectCard";
import { StackCatalog } from "@/components/StackCatalog";
import { getCopy } from "@/lib/i18n/copy";
import { getLocalizedMetadata } from "@/lib/i18n/metadata";
import { isSupportedLocale, localizedPath } from "@/lib/i18n/routing";
import { loadPublicProjects } from "@/lib/publicProjects";
import { projectPublicationView } from "@/lib/publicationPresentation";
import { loadWebsiteStack } from "@/lib/websiteStack";

const SELECTED_PROJECTS = ["mstefan-dev", "ai_agents", "PhysIQ"];

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  return getLocalizedMetadata(locale, "home");
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const content = getCopy(locale).home;
  const [{ projects, publication }, stackCatalog] = await Promise.all([loadPublicProjects(locale), loadWebsiteStack()]);
  const projectsByTitle = new Map(projects.map((project) => [project.title, project]));
  const selectedProjects = SELECTED_PROJECTS.flatMap((title) => {
    const project = projectsByTitle.get(title);
    return project ? [project] : [];
  });
  const toolkitEntries = stackCatalog.entries.filter((entry) => entry.websiteVisible);
  const publicationView = publication.message
    ? projectPublicationView(locale, publication.message)
    : null;
  const toolkitMessage = stackCatalog.message
    ? getCopy(locale).publication.stack[stackCatalog.message]
    : (toolkitEntries.length === 0 ? getCopy(locale).publication.toolkitEmpty : null);

  return (
    <section className="space-y-10">
      <header className="pt-4">
        <p className="text-sm text-black/60 dark:text-white/60">{content.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{content.title}</h1>
        <p className="mt-4 max-w-prose text-black/70 dark:text-white/70">{content.introduction}</p>
        <div className="mt-6 flex gap-3">
          <Link
            href={localizedPath(locale, "/projects")}
            className="rounded-xl bg-[hsl(var(--accent))] px-4 py-2 font-medium text-black no-underline hover:opacity-90"
          >
            {content.projectsAction}
          </Link>
          <a
            href="mailto:massimo@mstefan.dev"
            className="rounded-xl border px-4 py-2 font-medium no-underline border-black/15 hover:border-accent dark:border-white/15"
          >
            {content.contactAction}
          </a>
        </div>
      </header>

      <section aria-labelledby="selected-work-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="selected-work-heading" className="text-xl font-semibold">{content.selectedWork}</h2>
            <p className="mt-2 text-sm text-black/60 dark:text-white/60">{content.selectedWorkDescription}</p>
          </div>
          <Link href={localizedPath(locale, "/projects")} className="shrink-0 text-sm font-medium">
            {content.allProjects}
          </Link>
        </div>

        {selectedProjects.length > 0 ? (
          <div className="mt-4 border-t border-black/10 dark:border-white/10">
            {selectedProjects.map((project) => (
              <ProjectCard key={project.title} {...project} stackCatalog={stackCatalog.entries} locale={locale} />
            ))}
          </div>
        ) : publicationView ? (
          <p
            className="mt-4 rounded-xl border border-black/10 bg-black/[0.03] p-4 text-sm text-black/70 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
            role={publicationView.role}
          >
            {publicationView.message}
          </p>
        ) : null}
      </section>

      <section className="border-y border-black/10 py-5 dark:border-white/10" aria-labelledby="toolkit-heading">
        <h2 id="toolkit-heading" className="text-xl font-semibold">{content.toolkit}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-black/60 dark:text-white/60">{content.toolkitDescription}</p>
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
            <StackCatalog entries={toolkitEntries} locale={locale} />
          )}
        </div>
      </section>
    </section>
  );
}
