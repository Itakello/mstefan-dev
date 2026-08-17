import type { Metadata } from "next";
import { useMDXComponents } from "./mdx-components";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { INITIAL_THEME_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  metadataBase: new URL("https://mstefan.dev"),
  title: {
    default: "Massimo Stefan",
    template: "%s · Massimo Stefan"
  },
  description: "Software engineer building AI systems, agents, and reliable automation.",
  openGraph: {
    title: "Massimo Stefan",
    description: "Software engineer building AI systems, agents, and reliable automation.",
    url: "https://mstefan.dev",
    siteName: "mstefan.dev",
    locale: "en_US",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Massimo Stefan",
    description: "Software engineer building AI systems, agents, and reliable automation."
  },
  icons: {
    icon: "/icon.svg"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INITIAL_THEME_SCRIPT }} />
      </head>
      <body>
        <div className="container">
          <Header />
          <main className="py-10">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
