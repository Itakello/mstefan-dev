import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Prose } from "@/components/Prose";
import { getMailRulesCopy } from "@/lib/i18n/mailRules";
import { isSupportedLocale } from "@/lib/i18n/routing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const content = getMailRulesCopy(locale).overview;
  return {
    title: content.title,
    description: content.description,
    robots: { index: false, follow: false },
  };
}

export default async function MailRulesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const content = getMailRulesCopy(locale).overview;

  return (
    <Prose>
      <h1>{content.title}</h1>
      <p>{content.introduction}</p>

      <h2>{content.capabilitiesTitle}</h2>
      <ul>
        {content.capabilities.map((capability) => <li key={capability}>{capability}</li>)}
      </ul>

      <h2>{content.controlTitle}</h2>
      <p>{content.control}</p>

      <p>
        {content.privacyLead}{" "}
        <Link href={`/${locale}/mail-rules/privacy`}>{content.privacyLink}</Link>{" "}
        {content.privacySuffix}
      </p>
    </Prose>
  );
}
