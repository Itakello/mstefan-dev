import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { NotFoundContent } from "@/components/NotFoundContent";
import { getCopy } from "@/lib/i18n/copy";
import { getNotFoundLocale } from "@/lib/i18n/preferredLocale";
import { localizedPath } from "@/lib/i18n/routing";
import { INITIAL_THEME_SCRIPT } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: "404 · Massimo Stefan",
};

export default async function GlobalNotFound() {
  const locale = await getNotFoundLocale();
  const copy = getCopy(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon.svg" />
        <script dangerouslySetInnerHTML={{ __html: INITIAL_THEME_SCRIPT }} />
      </head>
      <body>
        <div className="container">
          <header className="flex items-center justify-between pt-8">
            <Link href={localizedPath(locale, "/")} aria-label={copy.header.homeLabel} className="flex items-center gap-3 no-underline">
              <span className="relative size-11 overflow-hidden rounded-xl">
                <Image src="/profile-photo.jpg" alt={copy.header.portraitAlt} width={1530} height={2054} className="absolute left-1/2 top-[-2px] h-auto w-[88px] max-w-none -translate-x-1/2" unoptimized />
              </span>
              <span className="font-semibold tracking-tight">Massimo Stefan</span>
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href={localizedPath(locale, "/")}>{copy.nav.home}</Link>
              <Link href={localizedPath(locale, "/projects")}>{copy.nav.projects}</Link>
            </nav>
          </header>
          <main className="py-10">
            <NotFoundContent locale={locale} projectToken={process.env.POSTHOG_PROJECT_TOKEN} />
          </main>
          <footer className="border-t border-black/10 py-6 text-xs text-[var(--page-muted)] dark:border-white/10">
            © {new Date().getFullYear()} Massimo Stefan. {copy.footer.rights}
          </footer>
        </div>
      </body>
    </html>
  );
}
