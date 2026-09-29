import type { Locale } from "./i18n/config";
import { isGitHubRepositoryUrl } from "./projectPresentation";
import type { Project } from "./projectPublication";

export const WEBSITE_PREVIEW_MAX_DEPTH = 3;

const PERSONAL_SITE_ORIGIN = "https://www.mstefan.dev";
const PRIVATE_PREVIEW_ORIGIN = "https://itakello-server.tailacf6a7.ts.net:10000";
export type ShowcaseWebsite = { id: string; url?: string; sourceUrl?: string; preview: boolean; name: string; description: string; shortDescription?: string; year?: string; language?: string; tags?: string[] };

export function workItemsFromProjects(projects: readonly Project[]): ShowcaseWebsite[] {
  const seen = new Set<string>();
  return projects.map((project, index) => {
    const metadata = { name: project.title, description: project.summary, shortDescription: project.shortSummary,
      year: project.year, language: project.language, tags: project.tags,
      sourceUrl: isGitHubRepositoryUrl(project.url) ? project.url : undefined };
    if (!project.websiteUrl) return { ...metadata, id: `project-${index}`,
      url: metadata.sourceUrl ? undefined : project.url, preview: false };
    let url: URL;
    try { url = new URL(project.websiteUrl!); } catch { throw new Error("Invalid approved website URL"); }
    if (url.protocol !== "https:" || url.username || url.password || seen.has(url.href)) {
      throw new Error("Invalid or duplicate approved website URL");
    }
    seen.add(url.href);
    const preview = [PERSONAL_SITE_ORIGIN, "https://mstefan.dev"].includes(url.origin)
      && url.pathname === "/" && !url.search && !url.hash;
    return { ...metadata, id: url.href, url: url.href, preview };
  });
}

export function personalPreviewOrigin(hostname: string, currentOrigin: string) {
  return hostname === "mstefan.dev" || hostname === "www.mstefan.dev" || currentOrigin === PRIVATE_PREVIEW_ORIGIN
    ? currentOrigin
    : PERSONAL_SITE_ORIGIN;
}

export function websitePreviewUrl(
  website: ShowcaseWebsite,
  locale: Locale,
  personalSiteOrigin: string = website.url || PERSONAL_SITE_ORIGIN,
) {
  if (!website.url) return undefined;
  if (!website.preview) return website.url;
  return `${personalSiteOrigin.replace(/\/$/, "")}/${locale}`;
}

export function canRenderWebsitePreview(depth: number) {
  return depth < WEBSITE_PREVIEW_MAX_DEPTH;
}
