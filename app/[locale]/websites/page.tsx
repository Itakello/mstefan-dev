import { notFound } from "next/navigation";

import { WebsiteShowcase } from "@/components/WebsiteShowcase";
import { getCopy } from "@/lib/i18n/copy";
import { getLocalizedMetadata } from "@/lib/i18n/metadata";
import { isSupportedLocale } from "@/lib/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  return getLocalizedMetadata(locale, "websites");
}

export default async function WebsitesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const content = getCopy(locale).websites;

  return (
    <section aria-labelledby="websites-heading">
      <h1 id="websites-heading" className="text-2xl font-semibold">{content.title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-black/70 dark:text-white/70">{content.description}</p>
      <WebsiteShowcase locale={locale} />
    </section>
  );
}
