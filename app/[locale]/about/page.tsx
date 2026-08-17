import Image from "next/image";
import { notFound } from "next/navigation";

import { Prose } from "@/components/Prose";
import { getCopy } from "@/lib/i18n/copy";
import { getLocalizedMetadata } from "@/lib/i18n/metadata";
import { isSupportedLocale } from "@/lib/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  return getLocalizedMetadata(locale, "about");
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const content = getCopy(locale).about;

  return (
    <section className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] md:items-start md:gap-12">
      <Prose>
        <h1>{content.title}</h1>
        <p>{content.firstParagraph}</p>
        <p>{content.secondParagraph}</p>
      </Prose>

      <figure className="w-full max-w-sm justify-self-center overflow-hidden rounded-2xl border border-black/10 bg-black/[0.03] md:justify-self-end dark:border-white/10 dark:bg-white/5">
        <Image
          src="/profile-photo.jpg"
          alt={content.imageAlt}
          width={1530}
          height={2054}
          unoptimized
          className="h-auto w-full"
        />
      </figure>
    </section>
  );
}
