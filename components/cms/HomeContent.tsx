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
      <header>
        <p className="text-sm text-black/60 dark:text-white/60">{content.eyebrow}</p>
        <h1 className="page-title mt-2">{content.title}</h1>
        <p className="page-introduction">{content.introduction}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={localizedPath(locale, "/projects")}
            className="rounded-xl bg-[hsl(var(--accent))] px-4 py-2 font-medium text-black no-underline hover:opacity-90"
          >
            {content.projectsAction}
          </Link>
          <a
            href="mailto:me@mstefan.dev"
            className="rounded-xl border px-4 py-2 font-medium no-underline border-black/15 hover:border-accent dark:border-white/15"
          >
            {content.contactAction}
          </a>
        </div>
      </header>

      <div className="page-columns">
        <section className="page-content lg:col-start-2 lg:row-start-1" aria-labelledby="selected-work-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="selected-work-heading" className="text-xl font-semibold">{content.selectedWork}</h2>
              <p className="mt-2 text-sm leading-6 text-black/60 dark:text-white/60">{content.selectedWorkDescription}</p>
            </div>
            <Link href={localizedPath(locale, "/projects")} className="shrink-0 text-sm font-medium">
              {content.allProjects}
            </Link>
          </div>

          {selectedWork}
        </section>

        <section className="min-w-0 border-t border-black/10 pt-8 dark:border-white/10 lg:col-start-1 lg:row-start-1 lg:border-0 lg:pt-0" aria-labelledby="toolkit-heading">
          <h2 id="toolkit-heading" className="text-xl font-semibold">{content.toolkit}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-black/60 dark:text-white/60">{content.toolkitDescription}</p>
          <div className="mt-4">
            {toolkit}
          </div>
        </section>
      </div>
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
