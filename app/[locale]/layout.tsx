import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { WebsiteAnalytics } from "@/components/WebsiteAnalytics";
import { supportedLocales } from "@/lib/i18n/config";
import { isSupportedLocale } from "@/lib/i18n/routing";
import { INITIAL_THEME_SCRIPT } from "@/lib/theme";

import "../globals.css";

export const dynamic = "force-dynamic";
export const dynamicParams = false;

export const metadata: Metadata = {
  metadataBase: new URL("https://mstefan.dev"),
  title: { default: "Massimo Stefan", template: "%s · Massimo Stefan" },
  icons: { icon: "/icon.svg" },
};

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INITIAL_THEME_SCRIPT }} />
      </head>
      <body>
        <WebsiteAnalytics projectToken={process.env.POSTHOG_PROJECT_TOKEN} />
        <div className="container flex min-h-svh flex-col">
          <Header locale={locale} />
          <main className="flex-1 py-10">{children}</main>
          <Footer locale={locale} />
        </div>
      </body>
    </html>
  );
}
