import type { Locale } from "./i18n/config";

export const WEBSITE_PREVIEW_MAX_DEPTH = 3;

export const showcaseWebsites = [
  { id: "mstefan", url: "https://www.mstefan.dev" },
  { id: "karakal", url: "https://www.thekarakaltimes.com" },
] as const;

export type ShowcaseWebsite = (typeof showcaseWebsites)[number];
export type ShowcaseWebsiteId = ShowcaseWebsite["id"];

export function websitePreviewUrl(
  website: ShowcaseWebsite,
  locale: Locale,
  personalSiteOrigin: string = website.url,
) {
  return website.id === "mstefan" ? `${personalSiteOrigin}/${locale}` : website.url;
}

export function canRenderWebsitePreview(depth: number) {
  return depth < WEBSITE_PREVIEW_MAX_DEPTH;
}
