import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { supportedLocales } from "@/lib/i18n/config";
import { isSupportedLocale } from "@/lib/i18n/routing";
import { INITIAL_THEME_SCRIPT } from "@/lib/theme";

import "../globals.css";

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
        <div className="container">
          <Header locale={locale} />
          <main className="py-10">{children}</main>
          <Footer locale={locale} />
        </div>
      </body>
    </html>
  );
}
