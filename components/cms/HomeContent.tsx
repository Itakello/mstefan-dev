"use client";

import Link from "next/link";
import { useLivePreview } from "@payloadcms/live-preview-react";
import type { Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import type { PageContent } from "@/lib/cms/types";

type Props = {
  content: PageContent<"home">;
  locale: Locale;
  selectedWork: React.ReactNode;
  toolkit: React.ReactNode;
};

export function HomeContent({ content, locale, selectedWork, toolkit }: Props) {
  return (
    <section className="space-y-10">
      <header className="pt-4">
        <p className="text-sm text-black/60 dark:text-white/60">{content.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{content.title}</h1>
        <p className="mt-4 max-w-prose text-black/70 dark:text-white/70">{content.introduction}</p>
        <div className="mt-6 flex gap-3">
          <Link
            href={localizedPath(locale, "/projects")}
            className="rounded-xl bg-[hsl(var(--accent))] px-4 py-2 font-medium text-black no-underline hover:opacity-90"
          >
            {content.projectsAction}
          </Link>
          <a
            href="mailto:massimo@mstefan.dev"
            className="rounded-xl border px-4 py-2 font-medium no-underline border-black/15 hover:border-accent dark:border-white/15"
          >
            {content.contactAction}
          </a>
        </div>
      </header>

      <section aria-labelledby="selected-work-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="selected-work-heading" className="text-xl font-semibold">{content.selectedWork}</h2>
            <p className="mt-2 text-sm text-black/60 dark:text-white/60">{content.selectedWorkDescription}</p>
          </div>
          <Link href={localizedPath(locale, "/projects")} className="shrink-0 text-sm font-medium">
            {content.allProjects}
          </Link>
        </div>

        {selectedWork}
      </section>

      <section className="border-y border-black/10 py-5 dark:border-white/10" aria-labelledby="toolkit-heading">
        <h2 id="toolkit-heading" className="text-xl font-semibold">{content.toolkit}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-black/60 dark:text-white/60">{content.toolkitDescription}</p>
        <div className="mt-4">
          {toolkit}
        </div>
      </section>
    </section>
  );
}

export function HomeLivePreview(props: Props) {
  const { data } = useLivePreview<PageContent<"home">>({
    initialData: props.content,
    serverURL: typeof window === "undefined" ? "" : window.location.origin,
    depth: 0,
  });
  return <HomeContent {...props} content={data} />;
}
