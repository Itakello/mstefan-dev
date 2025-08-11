import type { Metadata } from "next";
import { useMDXComponents } from "./mdx-components";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  metadataBase: new URL("https://mstefan.dev"),
  title: {
    default: "Massimo Stefan",
    template: "%s · Massimo Stefan"
  },
  description: "AI engineer. I build practical LLM systems, agents, and clean infra.",
  openGraph: {
    title: "Massimo Stefan",
    description: "AI engineer. I build practical LLM systems, agents, and clean infra.",
    url: "https://mstefan.dev",
    siteName: "mstefan.dev",
    images: ["/og-image.png"],
    locale: "en_US",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Massimo Stefan",
    description: "AI engineer. I build practical LLM systems, agents, and clean infra.",
    images: ["/og-image.png"]
  },
  icons: {
    icon: "/icon.svg"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
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
