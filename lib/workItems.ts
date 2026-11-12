import type { Locale } from "@/lib/i18n/config";
import { getCopy } from "@/lib/i18n/copy";
import { websiteScreenshotPaths } from "@/lib/websiteScreenshots";
import { type ShowcaseWebsite, websitePreviewTargets } from "@/lib/websiteShowcase";

/** Resolves website screenshot pages for Work items; published builds read them from the preview host. */
export function withScreenshotPages(items: readonly ShowcaseWebsite[], locale: Locale, published: boolean): ShowcaseWebsite[] {
  const copy = getCopy(locale);
  const pageLabels: Record<string, string> = { "/projects": copy.nav.projects, "/about": copy.nav.about, "/karakal": "The Karakal Times", "/yoga": "The Yoga Times" };
  return items.map(item => item.preview && item.url
    ? { ...item, screenshotPages: websitePreviewTargets({ websiteUrl: item.url, previewUrls: item.previewUrls }).map((url, index) => {
      const { pathname, search } = new URL(url);
      return {
        url, label: (index === 0 ? copy.work.homepage : pageLabels[pathname.replace(/^\/(en|it)(?=\/|$)/, "")] || pathname) + search,
        screenshots: websiteScreenshotPaths(url, locale, published ? "https://previews.mstefan.dev" : ""),
      };
    }) } : item);
}
