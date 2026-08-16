"use client";

import { Icon } from "@iconify/react";
import { useId, useState } from "react";

import { StackBadge } from "@/components/StackBadge";
import { StackCategoryIcon } from "@/components/StackCatalog";
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
    <article className="border-b border-black/10 dark:border-white/10">
      <div className="flex min-h-16 items-start gap-3 py-3 sm:items-center">
        <button
          type="button"
          className="group flex min-w-0 flex-1 items-start gap-3 text-left sm:items-center"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((open) => !open)}
        >
          <Icon
            icon="lucide:chevron-right"
            className={`mt-1 size-4 shrink-0 opacity-60 transition-transform sm:mt-0 ${isOpen ? "rotate-90" : ""}`}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold sm:text-base">{title}</span>
            <span className="mt-1 hidden line-clamp-1 text-xs leading-5 text-black/60 dark:text-white/60 sm:block">
              {summary}
            </span>
          </span>
        </button>

        {technologies.length > 0 && (
          <div className="flex shrink-0 items-center gap-3" aria-label={`${technologies.length} technologies`}>
            <div className="flex -space-x-1.5" aria-hidden>
              {technologies.slice(0, 3).map((item, index) => (
                <span key={item.name} className={index === 2 ? "hidden sm:inline-flex" : "inline-flex"}>
                  <StackBadge item={item} label={false} compact />
                </span>
              ))}
            </div>
            <span className="hidden w-5 text-right text-xs text-black/45 dark:text-white/45 sm:block">
              {technologies.length}
            </span>
          </div>
        )}

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

      {isOpen && (
        <div id={panelId} className="pb-6 pl-7 sm:pl-7">
          <p className="max-w-3xl text-sm leading-6 text-black/70 dark:text-white/70">{summary}</p>

          {groups.length > 0 && (
            <div className="mt-5 border-t border-black/10 pt-2 dark:border-white/10">
              {groups.map(({ category, entries }) => (
                <div
                  key={category}
                  className="grid gap-3 border-b border-black/10 py-2.5 last:border-b-0 dark:border-white/10 sm:grid-cols-[10rem_1fr] sm:items-center"
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-black/60 dark:text-white/60">
                    <StackCategoryIcon category={category} />
                    <span>{category}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                    {entries.map((item) => (
                      <StackBadge key={item.name} item={item} compact />
                    ))}
                  </div>
                </div>
              ))}
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
      )}
    </article>
  );
}
