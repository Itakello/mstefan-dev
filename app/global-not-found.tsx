import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { NotFoundContent } from "@/components/NotFoundContent";
import { getNotFoundLocale } from "@/lib/i18n/preferredLocale";
import { INITIAL_THEME_SCRIPT } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: "404 · Massimo Stefan",
};

export default async function GlobalNotFound() {
  const locale = await getNotFoundLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon.svg" />
        <script dangerouslySetInnerHTML={{ __html: INITIAL_THEME_SCRIPT }} />
      </head>
      <body>
        <div className="container">
          <Header locale={locale} />
          <main className="py-10">
            <NotFoundContent locale={locale} projectToken={process.env.POSTHOG_PROJECT_TOKEN} />
          </main>
          <Footer locale={locale} />
        </div>
      </body>
    </html>
  );
}
