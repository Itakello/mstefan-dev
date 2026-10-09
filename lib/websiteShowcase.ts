import type { Locale } from "./i18n/config";
import { isGitHubRepositoryUrl } from "./projectPresentation";
import type { Project, ProjectType } from "./projectPublication";

const PERSONAL_SITE_ORIGIN = "https://www.mstefan.dev";
export type ShowcaseWebsite = { id: string; type?: ProjectType; url?: string; sourceUrl?: string; preview: boolean; previewUrls?: string[]; screenshotPages?: { url: string; label: string; screenshots: { desktop: string; mobile: string } }[]; name: string; description: string; shortDescription?: string; year?: string; paperUrl?: string; slidesUrl?: string; publication?: string; language?: string; tags?: string[] };

export function websitePreviewTargets(project: { websiteUrl?: string; previewUrls?: string[] }): string[] {
  const extras = project.previewUrls ?? [];
  if (!project.websiteUrl) {
    if (extras.length) throw new Error("Preview URLs require an approved website URL");
    return [];
  }
  if (extras.length > 9) throw new Error("Preview URLs allow at most 10 total pages");
  const targets: string[] = [];
  for (const value of [project.websiteUrl, ...extras]) {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error("Invalid approved website URL"); }
    if (!/^https:\/\//i.test(value.trim()) || url.protocol !== "https:" || url.username || url.password || url.href.includes("#")
      || (targets.length && url.origin !== new URL(targets[0]).origin) || targets.includes(url.href)) {
      throw new Error("Invalid or duplicate approved website URL in Preview URLs");
    }
    targets.push(url.href);
  }
  return targets;
}

export function approvedWebsiteUrls(projects: readonly { websiteUrl?: string; previewUrls?: string[] }[]): (string | undefined)[] {
  const seen = new Set<string>();
  return projects.map(project => {
    const websiteUrl = websitePreviewTargets(project)[0];
    if (!websiteUrl) return undefined;
    if (seen.has(websiteUrl)) throw new Error("Invalid or duplicate approved website URL");
    seen.add(websiteUrl);
    return websiteUrl;
  });
}

export function workItemsFromProjects(projects: readonly Project[]): ShowcaseWebsite[] {
  const urls = approvedWebsiteUrls(projects);
  return projects.map((project, index) => {
    const metadata = { type: project.type, name: project.title, description: project.summary, shortDescription: project.shortSummary,
      paperUrl: project.paperUrl, slidesUrl: project.slidesUrl, publication: project.publication,
      year: project.year, language: project.language, tags: project.tags,
      previewUrls: project.previewUrls,
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
  const personalSite = [PERSONAL_SITE_ORIGIN, "https://mstefan.dev"].includes(url.origin);
  if (url.origin === "https://www.thekarakaltimes.com") {
    const pathname = url.pathname.replace(/^\/en(?=\/|$)/, "");
    url.pathname = locale === "en" ? `/en${pathname.replace(/^\/$/, "")}` : pathname || "/";
    return url.href;
  }
  if (!personalSite) return website.url;
  url.pathname = `/${locale}${url.pathname.replace(/^\/(en|it)(?=\/|$)/, "").replace(/^\/$/, "")}`;
  return url.href;
}
