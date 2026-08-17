import type { Metadata } from "next";

import { getCopy, publicPagePaths, type PublicPage } from "./copy";
import type { Locale } from "./config";
import { localizedPath } from "./routing";

const siteUrl = "https://mstefan.dev";

export function getLocalizedMetadata(locale: Locale, page: PublicPage): Metadata {
  const content = getCopy(locale).metadata[page];
  const pathname = localizedPath(locale, publicPagePaths[page]);
  const alternatePaths = Object.fromEntries(
    (["en", "it"] as const).map((alternateLocale) => [
      alternateLocale,
      localizedPath(alternateLocale, publicPagePaths[page]),
    ]),
  );

  return {
    title: content.title,
    description: content.description,
    alternates: {
      canonical: pathname,
      languages: alternatePaths,
    },
    openGraph: {
      title: content.title,
      description: content.description,
      url: pathname,
      siteName: "mstefan.dev",
      locale: locale === "it" ? "it_IT" : "en_US",
      type: "website",
      images: [{ url: `${siteUrl}/${locale}/opengraph-image`, alt: getCopy(locale).og.description }],
    },
    twitter: {
      card: "summary_large_image",
      title: content.title,
      description: content.description,
      images: [`${siteUrl}/${locale}/twitter-image`],
    },
  };
}
