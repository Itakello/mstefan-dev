"use client";

import { Icon } from "@iconify/react";
import { motion } from "motion/react";
import { useId, useMemo, useState } from "react";

import { ProjectStackHand, StackShelf } from "@/components/StackCatalog";
import { BRAND_ICON_CLASS } from "@/lib/iconStyles";
import { getCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/config";
import { formatProjectStartDate, projectPreviewSummary } from "@/lib/projectPresentation";
import {
  groupStackEntries,
  projectStackLabels,
  resolveProjectStack,
  type StackEntry,
} from "@/lib/stack";

type Props = {
  title: string;
  shortSummary?: string;
  summary: string;
  createdAt?: string;
  url?: string;
  tags?: string[];
  language?: string;
  stackCatalog?: readonly StackEntry[];
  defaultOpen?: boolean;
  locale: Locale;
};

const panelTransition = {
  height: { duration: 0.36, ease: [0.4, 0, 0.2, 1] },
  opacity: { duration: 0.24, ease: [0.4, 0, 0.2, 1] },
} as const;

export function ProjectCard({
  title,
  shortSummary,
  summary,
  createdAt,
  url,
  tags,
  language,
  stackCatalog,
  defaultOpen = false,
  locale,
}: Props) {
  const copy = getCopy(locale);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = useId();
  const { groups, technologies } = useMemo(() => {
    const technologyLabels = projectStackLabels({ language, tags });
    const catalog = stackCatalog ?? [];
    const technologies = resolveProjectStack(technologyLabels, catalog);

    return {
      groups: groupStackEntries(technologies),
      technologies,
    };
  }, [language, stackCatalog, tags]);

  return (
    <article className="border-b border-black/10 dark:border-white/10">
      <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-3 py-2">
        <button
          type="button"
          className="group flex min-w-0 items-center gap-3 text-left"
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-label={copy.projectCard.toggleDetails(title, isOpen)}
          onClick={() => setIsOpen((open) => !open)}
        >
          <motion.span
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="grid size-4 shrink-0 place-items-center opacity-60"
          >
            <Icon
              icon="lucide:chevron-right"
              className="size-4"
              aria-hidden
            />
          </motion.span>
          <span className="block min-w-0 truncate text-sm font-semibold sm:text-base">{title}</span>
        </button>

        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 bg-black/[0.025] no-underline text-black/65 transition-colors hover:border-black/20 hover:bg-black/5 hover:text-black dark:border-white/10 dark:bg-white/[0.035] dark:text-white/65 dark:hover:border-white/20 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label={copy.projectCard.viewRepository(title)}
          >
            <Icon icon="simple-icons:github" className={BRAND_ICON_CLASS} aria-hidden />
          </a>
        )}
      </div>

      <div id={panelId} className="pl-7">
        <motion.div
          initial={false}
          animate={isOpen ? { height: 0, opacity: 0 } : { height: "auto", opacity: 1 }}
          transition={panelTransition}
          className="project-panel"
          aria-hidden={isOpen}
          inert={isOpen}
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 pb-3">
            <p className="line-clamp-2 min-w-0 text-sm leading-5 text-black/65 dark:text-white/65">
              {projectPreviewSummary({ summary, shortSummary })}
            </p>
            {technologies.length > 0 && (
              <div className="shrink-0">
                <ProjectStackHand entries={technologies} locale={locale} />
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={false}
          animate={isOpen ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
          transition={panelTransition}
          className="project-panel"
          aria-hidden={!isOpen}
          inert={!isOpen}
        >
          <div className="pb-2">
            <p className="max-w-3xl text-sm leading-6 text-black/70 dark:text-white/70">
              {summary}
            </p>

            {createdAt && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-black/45 dark:text-white/45">
                <Icon icon="lucide:calendar-range" className="size-3.5" aria-hidden />
                {copy.projectCard.started(formatProjectStartDate(locale, createdAt))}
              </p>
            )}

            {groups.length > 0 && (
              <div className="mt-3">
                <StackShelf
                  groups={groups}
                  locale={locale}
                  label={copy.projectCard.technologiesByCategory(title)}
                />
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </article>
  );
}
