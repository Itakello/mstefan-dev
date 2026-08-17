"use client";

import { Icon } from "@iconify/react";
import { motion } from "motion/react";
import { useId, useMemo, useState } from "react";

import { ProjectStackHand, StackShelf } from "@/components/StackCatalog";
import {
  findStackEntry,
  groupStackEntries,
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
};

const KNOWN_LANGUAGES = new Set([
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "C++",
  "C#",
  "Go",
  "Rust",
  "Ruby",
  "PHP",
  "Kotlin",
  "Swift",
  "Scala",
  "Dart",
]);

function formatMonthYear(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

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
}: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = useId();
  const { groups, technologies, unresolvedLabels } = useMemo(() => {
    const detectedLanguage = language || tags?.find((tag) => KNOWN_LANGUAGES.has(tag));
    const nonLanguageTags = (tags ?? []).filter((tag) => !KNOWN_LANGUAGES.has(tag));
    const technologyLabels = [detectedLanguage, ...nonLanguageTags].filter(
      (label): label is string => Boolean(label),
    );
    const catalog = stackCatalog ?? [];
    const technologies = resolveProjectStack(technologyLabels, catalog);

    return {
      groups: groupStackEntries(technologies),
      technologies,
      unresolvedLabels: technologyLabels.filter((label) => !findStackEntry(label, catalog)),
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
            className="grid size-9 shrink-0 place-items-center rounded-md no-underline text-black/65 transition-colors hover:bg-black/5 hover:text-black dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label={`View ${title} repository on GitHub`}
          >
            <Icon icon="simple-icons:github" className="size-[18px]" aria-hidden />
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
              {shortSummary || summary}
            </p>
            {technologies.length > 0 && (
              <div className="shrink-0">
                <ProjectStackHand entries={technologies} />
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
          <div className="pb-6">
            <p className="max-w-3xl text-sm leading-6 text-black/70 dark:text-white/70">
              {summary}
            </p>

            {createdAt && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-black/45 dark:text-white/45">
                <Icon icon="lucide:calendar-range" className="size-3.5" aria-hidden />
                Started {formatMonthYear(createdAt)}
              </p>
            )}

            {groups.length > 0 && (
              <div className="mt-3">
                <StackShelf
                  groups={groups}
                  label={`${title} technologies grouped by category`}
                />
              </div>
            )}

            {unresolvedLabels.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-black/55 dark:text-white/55">
                {unresolvedLabels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </article>
  );
}
