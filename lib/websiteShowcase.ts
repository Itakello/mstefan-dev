import type { Locale } from "./i18n/config";
import { isGitHubRepositoryUrl } from "./projectPresentation";
import type { Project, ProjectType } from "./projectPublication";

const PERSONAL_SITE_ORIGIN = "https://www.mstefan.dev";
export type ShowcaseWebsite = { id: string; type?: ProjectType; url?: string; sourceUrl?: string; preview: boolean; screenshots?: { desktop: string; mobile: string }; name: string; description: string; shortDescription?: string; year?: string; paperUrl?: string; slidesUrl?: string; publication?: string; language?: string; tags?: string[] };

export function approvedWebsiteUrls(projects: readonly { websiteUrl?: string }[]): (string | undefined)[] {
  const seen = new Set<string>();
  return projects.map(({ websiteUrl }) => {
    if (!websiteUrl) return undefined;
    let url: URL;
    try { url = new URL(websiteUrl); } catch { throw new Error("Invalid approved website URL"); }
    if (url.protocol !== "https:" || url.username || url.password || seen.has(url.href)) {
      throw new Error("Invalid or duplicate approved website URL");
    }
    seen.add(url.href);
    return url.href;
  });
}

export function workItemsFromProjects(projects: readonly Project[]): ShowcaseWebsite[] {
  const urls = approvedWebsiteUrls(projects);
  return projects.map((project, index) => {
    const metadata = { type: project.type, name: project.title, description: project.summary, shortDescription: project.shortSummary,
      paperUrl: project.paperUrl, slidesUrl: project.slidesUrl, publication: project.publication,
      year: project.year, language: project.language, tags: project.tags,
      sourceUrl: isGitHubRepositoryUrl(project.url) ? project.url : undefined };
    const websiteUrl = urls[index];
    if (!websiteUrl) return { ...metadata, id: `project-${index}`,
      url: metadata.sourceUrl ? undefined : project.url, preview: false };
    const url = new URL(websiteUrl);
    return { ...metadata, id: url.href, url: url.href, preview: true };
  });
}

export function websitePreviewUrl(
  website: ShowcaseWebsite,
  locale: Locale,
) {
  if (!website.url) return undefined;
  if (!website.preview) return website.url;
  const url = new URL(website.url);
  const personalHomepage = [PERSONAL_SITE_ORIGIN, "https://mstefan.dev"].includes(url.origin)
    && url.pathname === "/" && !url.search && !url.hash;
  return website.preview && personalHomepage ? `${url.origin}/${locale}` : website.url;
}
