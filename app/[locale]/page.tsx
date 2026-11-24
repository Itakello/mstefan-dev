import { HomeContent, HomeLivePreview } from "@/components/cms/HomeContent";
import { CurrentWork } from "@/components/CurrentWork";
import { FeaturedWork } from "@/components/FeaturedWork";
import { notFound, redirect } from "next/navigation";

import { getLocalizedMetadata } from "@/lib/i18n/metadata";
import { publicationEnvironment } from "@/lib/publicationEnvironment";
import { isSupportedLocale } from "@/lib/i18n/routing";
import { loadPublicProjects } from "@/lib/publicProjects";
import { getNotionPublicationSnapshot } from "@/lib/notionPublicationSnapshot";
import { projectPublicationView } from "@/lib/publicationPresentation";
import { repositoryUrlKey } from "@/lib/projectPublication";
import { isGitHubRepositoryUrl } from "@/lib/projectPresentation";
import { withScreenshotPages } from "@/lib/workItems";
import { workItemsFromProjects } from "@/lib/websiteShowcase";

// Keyed by repository or website origin so a renamed project keeps its Home card.
const featureKey = (url: string) => isGitHubRepositoryUrl(url) ? repositoryUrlKey(url) : new URL(url).origin;
const FEATURED_PROJECTS = [
  "https://github.com/Itakello/PhysIQ",
  "https://github.com/Itakello/ai_agents",
  "https://github.com/mobs-fbk/llm_interaction_simulator",
  "https://www.thekarakaltimes.com",
].map(featureKey);

export const revalidate = 86_400;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  return getLocalizedMetadata(locale, "home");
}

export default async function Home({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ preview?: string; previewSource?: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const { getPageContent } = await import("@/lib/cms/pageContent");
  const query = await searchParams;
  const preview = query.preview === "1";
  const careerPreview = preview && query.previewSource === "career";
  if (careerPreview) redirect(`/${locale}/about?preview=1&previewSource=career`);
  const { getCareerContent } = await import("@/lib/cms/career");
  const loadProjects = async () => {
    const snapshot = publicationEnvironment() === "production" ? await getNotionPublicationSnapshot() : null;
    return { snapshot, ...await loadPublicProjects(locale, snapshot ? { fetchProjects: async () => snapshot.projects } : undefined) };
  };
  const [content, career, { snapshot, projects, publication }] = await Promise.all([getPageContent("home", locale, preview), getCareerContent(locale, false), loadProjects()]);
  const byUrl = new Map(workItemsFromProjects(projects).flatMap((item) => [item.sourceUrl, item.url].flatMap((url) => url ? [[featureKey(url), item] as const] : [])));
  const featured = withScreenshotPages(FEATURED_PROJECTS.flatMap((key) => byUrl.get(key) ?? []), locale, Boolean(snapshot));
  const publicationView = publication.message
    ? projectPublicationView(locale, publication.message)
    : null;

  const Content = preview ? HomeLivePreview : HomeContent;
  return (
    <>
    {snapshot && <span hidden data-publication-digest={snapshot.digest} data-publication-checked-at={snapshot.checkedAt} />}
    <Content
      content={content}
      locale={locale}
      current={<CurrentWork jobs={career.jobs ?? []} locale={locale} now={Date.now()} />}
      selectedWork={featured.length > 0 ? (
        <FeaturedWork items={featured} locale={locale} />
      ) : publicationView ? (
        <p className="mt-4 rounded-xl border border-black/10 bg-black/[0.03] p-4 text-sm text-black/70 dark:border-white/10 dark:bg-white/5 dark:text-white/70" role={publicationView.role}>{publicationView.message}</p>
      ) : null}
    />
    </>
  );
}
