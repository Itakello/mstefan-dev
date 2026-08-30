import { notFound } from "next/navigation";

import { ProjectCard } from "@/components/ProjectCard";
import { ProjectLayoutGroup, ProjectLayoutItem } from "@/components/ProjectLayoutGroup";
import { getCopy } from "@/lib/i18n/copy";
import { getLocalizedMetadata } from "@/lib/i18n/metadata";
import { isSupportedLocale } from "@/lib/i18n/routing";
import { loadPublicProjects } from "@/lib/publicProjects";
import { projectPublicationView } from "@/lib/publicationPresentation";
import { loadWebsiteStack } from "@/lib/websiteStack";

export const dynamic = "error";
export const revalidate = false;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  return getLocalizedMetadata(locale, "projects");
}

export default async function ProjectsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const content = getCopy(locale).projects;
  const [{ groups, orderedYears, publication }, stackCatalog] = await Promise.all([loadPublicProjects(locale), loadWebsiteStack()]);
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

      <ProjectLayoutGroup>
        {orderedYears.map((year, yearIndex) => (
          <ProjectLayoutItem key={year} className="mt-8 first:mt-8">
            <h2 className="text-xl font-semibold">{year}</h2>
            <div className="mt-3 border-t border-black/10 dark:border-white/10">
              {groups[year].map((project, projectIndex) => (
                <ProjectCard
                  key={`${year}-${project.title}`}
                  {...project}
                  stackCatalog={stackCatalog.entries}
                  defaultOpen={yearIndex === 0 && projectIndex === 0}
                  locale={locale}
                />
              ))}
            </div>
          </ProjectLayoutItem>
        ))}
      </ProjectLayoutGroup>
    </section>
  );
}
