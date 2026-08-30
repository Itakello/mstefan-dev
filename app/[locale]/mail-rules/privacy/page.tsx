import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Prose } from "@/components/Prose";
import { isSupportedLocale } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Mail Rules privacy policy",
  description: "How the personal Mail Rules tool accesses and handles Google user data.",
  robots: { index: false, follow: false },
};

export default async function MailRulesPrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  return (
    <Prose>
      <h1>Mail Rules privacy policy</h1>
      <p>Last updated: August 30, 2026.</p>

      <p>
        This policy describes how Mail Rules, a personal tool operated by Massimo
        Stefan, accesses and handles Google user data.
      </p>

      <h2>Google user data accessed</h2>
      <p>Mail Rules requests only the Gmail permissions needed to:</p>
      <ul>
        <li>list, create, and manage Gmail labels;</li>
        <li>list, create, and delete Gmail filters;</li>
        <li>
          search for matching messages and read their sender, subject, date,
          snippet, thread identifier, and label identifiers for rule previews.
        </li>
      </ul>
      <p>Mail Rules does not read message bodies or attachments.</p>

      <h2>How data is used</h2>
      <p>
        Google user data is used only to compare the owner&apos;s approved policy with
        Gmail, preview proposed changes, apply explicitly approved filter or label
        changes, and verify the result. It is not used for advertising, profiling,
        model training, or any unrelated purpose.
      </p>

      <h2>Storage and retention</h2>
      <p>
        Mail Rules runs locally on the owner&apos;s computer. It does not operate a
        server-side mailbox database and does not persist message metadata or
        snippets. The OAuth client configuration and refresh token are stored in
        ignored local files and may be backed up in the owner&apos;s private 1Password
        vault. When the owner invokes Mail Rules through OpenAI Codex, previews may
        temporarily include the limited message metadata listed above. The OAuth
        client secret and tokens are never included in those previews.
      </p>

      <h2>Sharing and transfer</h2>
      <p>
        Google user data is not sold, rented, shared with advertisers, or used for
        model training by Mail Rules. Limited message metadata may be processed by
        OpenAI only when the owner explicitly invokes a preview or rule test through
        Codex. OAuth credentials may be stored in the owner&apos;s private 1Password vault
        solely for backup. Mail Rules&apos; use and transfer of information received from
        Google APIs adheres to the Google API Services User Data Policy, including its
        Limited Use requirements.
      </p>

      <h2>Security and user control</h2>
      <p>
        Credentials are excluded from version control. Gmail-changing operations are
        approval-gated, and destructive filter replacement is restricted to one exact,
        verified conflict. The owner can revoke access at any time from Google Account
        security settings and can delete the local OAuth files and private backup to
        remove stored credentials.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy can be sent to{" "}
        <a href="mailto:maxste000@gmail.com">maxste000@gmail.com</a>.
      </p>

      <p>
        Return to the <Link href={`/${locale}/mail-rules`}>Mail Rules overview</Link>.
      </p>
    </Prose>
  );
}
