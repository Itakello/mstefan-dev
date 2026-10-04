import Link from "next/link";

import { NotFoundAnalytics } from "@/components/NotFoundAnalytics";
import type { Locale } from "@/lib/i18n/config";
import { getCopy } from "@/lib/i18n/copy";
import { localizedPath } from "@/lib/i18n/routing";

export function NotFoundContent({ locale, projectToken }: { locale: Locale; projectToken?: string }) {
  const copy = getCopy(locale).notFound;

  return (
    <section className="mx-auto max-w-xl py-16 sm:py-24">
      <NotFoundAnalytics locale={locale} projectToken={projectToken} />
      <p className="mb-5 text-sm font-semibold tracking-widest text-[hsl(var(--accent))]">404</p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{copy.title}</h1>
      <p className="mt-5 text-lg leading-relaxed text-[var(--page-muted)]">{copy.description}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={localizedPath(locale, "/")} className="rounded-lg bg-[hsl(var(--accent))] px-5 py-3 font-medium text-white no-underline hover:opacity-90">{copy.home}</Link>
        <Link href={localizedPath(locale, "/projects")} className="rounded-lg border border-black/15 px-5 py-3 font-medium no-underline hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">{copy.projects}</Link>
      </div>
    </section>
  );
}
