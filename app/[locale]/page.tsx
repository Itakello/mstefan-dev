import { HomeContent, HomeLivePreview } from "@/components/cms/HomeContent";
import { notFound } from "next/navigation";

import { ProjectCard } from "@/components/ProjectCard";
import { StackCatalog } from "@/components/StackCatalog";
import { getCopy } from "@/lib/i18n/copy";
import { getLocalizedMetadata } from "@/lib/i18n/metadata";
import { isSupportedLocale } from "@/lib/i18n/routing";
import { loadPublicProjects } from "@/lib/publicProjects";
import { projectPublicationView } from "@/lib/publicationPresentation";
import { assertProjectStackCoverage } from "@/lib/stack";
import { loadWebsiteStack } from "@/lib/websiteStack";

const SELECTED_PROJECTS = ["mstefan-dev", "ai_agents", "PhysIQ"];

export const revalidate = 86_400;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  return getLocalizedMetadata(locale, "home");
}

export default async function Home({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const { getPageContent } = await import("@/lib/cms/pageContent");
  const preview = (await searchParams).preview === "1";
  const content = await getPageContent("home", locale, preview);
  const [{ projects, publication }, stackCatalog] = await Promise.all([loadPublicProjects(locale), loadWebsiteStack()]);
  if (stackCatalog.status === "ready") {
    assertProjectStackCoverage(publication.projects, stackCatalog.entries);
  }
  const projectsByTitle = new Map(projects.map((project) => [project.title, project]));
  const selectedProjects = SELECTED_PROJECTS.flatMap((title) => {
    const project = projectsByTitle.get(title);
    return project ? [project] : [];
  });
  const toolkitEntries = stackCatalog.entries;
  const publicationView = publication.message
    ? projectPublicationView(locale, publication.message)
    : null;
  const toolkitMessage = stackCatalog.message
    ? getCopy(locale).publication.stack[stackCatalog.message]
    : (toolkitEntries.length === 0 ? getCopy(locale).publication.toolkitEmpty : null);

  const Content = preview ? HomeLivePreview : HomeContent;
  return (
    <Content
      content={content}
      locale={locale}
      selectedWork={selectedProjects.length > 0 ? (
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
      toolkit={toolkitMessage ? (
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
    />
  );
}
