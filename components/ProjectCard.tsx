"use client";

import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";

import { StackShelf } from "@/components/StackCatalog";
import {
  findStackEntry,
  groupStackEntries,
  resolveProjectStack,
  type StackEntry,
} from "@/lib/stack";

type Props = {
  title: string;
  summary: string;
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

const projectLayoutTransition = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.7,
} as const;

export function ProjectCard({
  title,
  summary,
  url,
  tags,
  language,
  stackCatalog,
  defaultOpen = false,
}: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = useId();
  const detectedLanguage = language || tags?.find((tag) => KNOWN_LANGUAGES.has(tag));
  const nonLanguageTags = (tags ?? []).filter((tag) => !KNOWN_LANGUAGES.has(tag));
  const technologyLabels = [detectedLanguage, ...nonLanguageTags].filter(
    (label): label is string => Boolean(label),
  );
  const catalog = stackCatalog ?? [];
  const technologies = resolveProjectStack(technologyLabels, catalog);
  const groups = groupStackEntries(technologies);
  const unresolvedLabels = technologyLabels.filter((label) => !findStackEntry(label, catalog));

  return (
    <motion.article
      layout="position"
      transition={{ layout: projectLayoutTransition }}
      className="border-b border-black/10 dark:border-white/10"
    >
      <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-3 py-3">
        <button
          type="button"
          className="group flex min-w-0 items-center gap-3 text-left"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((open) => !open)}
        >
          <motion.span
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
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

      <motion.div
        id={panelId}
        layout
        transition={{ layout: projectLayoutTransition }}
        className={`overflow-hidden pl-7 ${isOpen ? "pb-6" : "pb-3"}`}
      >
        <motion.p
          layout="position"
          transition={{ layout: projectLayoutTransition }}
          className="max-w-3xl text-sm leading-6 text-black/70 dark:text-white/70"
        >
          {summary}
        </motion.p>

        {groups.length > 0 && (
          <div className="mt-3">
            <StackShelf
              groups={groups}
              label={`${title} technologies grouped by category`}
              compact={!isOpen}
              animateLayout
            />
          </div>
        )}

        <AnimatePresence initial={false}>
          {isOpen && unresolvedLabels.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-black/55 dark:text-white/55"
            >
              {unresolvedLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.article>
  );
}
