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
  const content = getMailRulesCopy(locale).privacy;
  return {
    title: content.title,
    description: content.description,
    robots: { index: false, follow: false },
  };
}

export default async function MailRulesPrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const content = getMailRulesCopy(locale).privacy;

  return (
    <Prose>
      <h1>{content.title}</h1>
      <p>{content.updated}</p>
      <p>{content.introduction}</p>

      <h2>{content.accessTitle}</h2>
      <p>{content.accessIntroduction}</p>
      <ul>
        {content.accessItems.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <p>{content.accessBoundary}</p>

      <h2>{content.useTitle}</h2>
      <p>{content.use}</p>

      <h2>{content.storageTitle}</h2>
      <p>{content.storage}</p>
      <p>{content.codexHandling}</p>

      <h2>{content.sharingTitle}</h2>
      <p>{content.sharing}</p>
      <p>
        {content.limitedUse}{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </a>
        .
      </p>

      <h2>{content.securityTitle}</h2>
      <p>{content.security}</p>
      <p>{content.deletionBoundary}</p>

      <h2>{content.contactTitle}</h2>
      <p>
        {content.contactLead}{" "}
        <a href="mailto:maxste000@gmail.com">maxste000@gmail.com</a>.
      </p>

      <p>
        {content.returnLead}{" "}
        <Link href={`/${locale}/mail-rules`}>{content.returnLink}</Link>.
      </p>
    </Prose>
  );
}
