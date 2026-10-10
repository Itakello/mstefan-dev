import { notFound } from "next/navigation";

import { WorkExplorer } from "@/components/WorkExplorer";
import { getCopy } from "@/lib/i18n/copy";
import { getLocalizedMetadata } from "@/lib/i18n/metadata";
import { publicationEnvironment } from "@/lib/publicationEnvironment";
import { isSupportedLocale } from "@/lib/i18n/routing";
import { loadPublicProjects } from "@/lib/publicProjects";
import { getNotionPublicationSnapshot } from "@/lib/notionPublicationSnapshot";
import { projectPublicationView } from "@/lib/publicationPresentation";
import { assertProjectStackCoverage } from "@/lib/stack";
import { loadWebsiteStack } from "@/lib/websiteStack";
import { websiteScreenshotPaths } from "@/lib/websiteScreenshots";
import { websitePreviewTargets, workItemsFromProjects } from "@/lib/websiteShowcase";

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
  const copy = getCopy(locale);
  const pageLabels: Record<string, string> = { "/projects": copy.nav.projects, "/about": copy.nav.about, "/karakal": "The Karakal Times", "/yoga": "The Yoga Times" };
  const snapshot = publicationEnvironment() === "production"
    ? await getNotionPublicationSnapshot()
    : null;
  const [{ projects, publication }, stackCatalog] = await Promise.all([
    loadPublicProjects(locale, snapshot ? { fetchProjects: async () => snapshot.projects } : undefined),
    snapshot ? { status: "ready" as const, entries: snapshot.stack, message: null } : loadWebsiteStack(),
  ]);
  if (stackCatalog.status === "ready") assertProjectStackCoverage(publication.projects, stackCatalog.entries);
  const items = workItemsFromProjects(projects).map(item => item.preview && item.url
    ? { ...item, screenshotPages: websitePreviewTargets({ websiteUrl: item.url, previewUrls: item.previewUrls }).map((url, index) => ({
      url, label: index === 0 ? copy.work.homepage : pageLabels[new URL(url).pathname.replace(/^\/(en|it)(?=\/|$)/, "")] || new URL(url).pathname,
      screenshots: websiteScreenshotPaths(url, locale, snapshot ? "https://previews.mstefan.dev" : ""),
    })) } : item);
  const publicationView = publication.message
    ? projectPublicationView(locale, publication.message)
    : null;

  return (
    <section aria-labelledby="public-projects-heading" data-publication-digest={snapshot?.digest} data-publication-checked-at={snapshot?.checkedAt}>
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

      <WorkExplorer locale={locale} items={items} stackCatalog={stackCatalog} />
    </section>
  );
}
