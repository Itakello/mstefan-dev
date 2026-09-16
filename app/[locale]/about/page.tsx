import { AboutContent, AboutLivePreview } from "@/components/cms/AboutContent";
import { notFound } from "next/navigation";

import { getLocalizedMetadata } from "@/lib/i18n/metadata";
import { isSupportedLocale } from "@/lib/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  return getLocalizedMetadata(locale, "about");
}

export default async function AboutPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const { getPageContent } = await import("@/lib/cms/pageContent");
  const preview = (await searchParams).preview === "1";
  const content = await getPageContent("about", locale, preview);

  const Content = preview ? AboutLivePreview : AboutContent;
  return <Content content={content} />;
}
