import { notFound } from "next/navigation";

import { WorkExplorer } from "@/components/WorkExplorer";
import { getCopy } from "@/lib/i18n/copy";
import { getLocalizedMetadata } from "@/lib/i18n/metadata";
import { isSupportedLocale } from "@/lib/i18n/routing";
import { loadPublicProjects } from "@/lib/publicProjects";
import { projectPublicationView } from "@/lib/publicationPresentation";
import { assertProjectStackCoverage } from "@/lib/stack";
import { loadWebsiteStack } from "@/lib/websiteStack";
import { workItemsFromProjects } from "@/lib/websiteShowcase";

export const revalidate = 86_400;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  return getLocalizedMetadata(locale, "projects");
}

export default async function ProjectsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const content = getCopy(locale).projects;
  const [{ projects, publication }, stackCatalog] = await Promise.all([loadPublicProjects(locale), loadWebsiteStack()]);
  if (stackCatalog.status === "ready") assertProjectStackCoverage(publication.projects, stackCatalog.entries);
  const items = workItemsFromProjects(projects);
  const publicationView = publication.message
    ? projectPublicationView(locale, publication.message)
    : null;

  return (
    <section aria-labelledby="public-projects-heading">
      <h1 id="public-projects-heading" className="text-2xl font-semibold">{content.title}</h1>
      <p className="mt-2 text-sm text-black/70 dark:text-white/70">{content.description}</p>

      {publicationView && (
        <p
          className="mt-6 rounded-xl border border-black/10 bg-black/[0.03] p-4 text-sm text-black/70 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
          data-project-publication-status={publication.status}
          role={publicationView.role}
        >
          {publicationView.message}
        </p>
      )}

      <WorkExplorer locale={locale} items={items} />
    </section>
  );
}
