import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Prose } from "@/components/Prose";
import { isSupportedLocale } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Mail Rules",
  description: "Information about the personal Mail Rules Gmail automation.",
  robots: { index: false, follow: false },
};

export default async function MailRulesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  return (
    <Prose>
      <h1>Mail Rules</h1>
      <p>
        Mail Rules is a personal, locally run tool used by Massimo Stefan to keep
        Gmail filters and labels aligned with a version-controlled policy.
      </p>

      <h2>What it does</h2>
      <ul>
        <li>Reads the current Gmail labels and filters.</li>
        <li>Previews differences before any Gmail setting is changed.</li>
        <li>Creates approved labels and filters.</li>
        <li>
          Replaces a conflicting filter only after its replacement has been
          created and verified.
        </li>
        <li>Shows a small sample of message metadata when testing a rule.</li>
      </ul>

      <h2>Control and access</h2>
      <p>
        The tool is not offered to the public. It runs on the owner&apos;s computer,
        serves one Gmail account, and requires explicit approval before it changes
        Gmail. Unmanaged filters are not deletion candidates.
      </p>

      <p>
        Read the <Link href={`/${locale}/mail-rules/privacy`}>Mail Rules privacy policy</Link>{" "}
        for the exact data-access, storage, sharing, and deletion practices.
      </p>
    </Prose>
  );
}
