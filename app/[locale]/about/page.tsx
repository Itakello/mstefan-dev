import { CareerGraph, CareerLivePreview } from "@/components/CareerGraph";
import { AboutContent, AboutLivePreview } from "@/components/cms/AboutContent";
import { notFound } from "next/navigation";

import { getLocalizedMetadata } from "@/lib/i18n/metadata";
import { isSupportedLocale } from "@/lib/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  return getLocalizedMetadata(locale, "about");
}

export default async function AboutPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ preview?: string; previewSource?: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const { getPageContent } = await import("@/lib/cms/pageContent");
  const query = await searchParams;
  const preview = query.preview === "1";
  const careerPreview = preview && query.previewSource === "career";
  const { getCareerContent } = await import("@/lib/cms/career");
  const [content, career] = await Promise.all([getPageContent("about", locale, preview && !careerPreview), getCareerContent(locale, careerPreview)]);

  const Content = preview && !careerPreview ? AboutLivePreview : AboutContent;
  const CareerContent = careerPreview ? CareerLivePreview : CareerGraph;
  return <Content content={content} career={<CareerContent career={career} locale={locale} expanded />} />;
}
