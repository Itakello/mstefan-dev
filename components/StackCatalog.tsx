"use client";

import { Icon } from "@iconify/react";

import { StackBadge } from "@/components/StackBadge";
import { groupStackEntries, type StackEntry } from "@/lib/stack";

const categoryIcons: Record<string, string> = {
  language: "lucide:code-2",
  framework: "lucide:panels-top-left",
  library: "lucide:boxes",
  runtime: "lucide:play",
  database: "lucide:database",
  cloud: "lucide:cloud",
  platform: "lucide:cloud-cog",
  saas: "lucide:blocks",
  cli: "lucide:square-terminal",
};

export function StackCategoryIcon({ category }: { category: string }) {
  return (
    <Icon
      icon={categoryIcons[category.toLowerCase()] ?? "lucide:box"}
      className="size-4 opacity-70"
      aria-hidden
    />
  );
}

export function StackCatalog({ entries }: { entries: readonly StackEntry[] }) {
  const groups = groupStackEntries(entries);

  return (
    <div className="divide-y divide-black/10 border-y border-black/10 dark:divide-white/10 dark:border-white/10">
      {groups.map(({ category, entries: items }) => (
        <details key={category} className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 py-2 text-sm marker:content-none">
            <span className="grid size-8 shrink-0 place-items-center rounded-md border border-black/10 dark:border-white/10">
              <StackCategoryIcon category={category} />
            </span>
            <span className="font-medium">{category}</span>
            <span className="text-xs text-black/45 dark:text-white/45">{items.length}</span>
            <span className="ml-auto flex -space-x-1.5 overflow-hidden pr-2" aria-hidden>
              {items.slice(0, 5).map((item) => (
                <StackBadge key={item.name} item={item} label={false} compact />
              ))}
            </span>
            <Icon
              icon="lucide:chevron-down"
              className="size-4 shrink-0 opacity-60 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 pb-4 pl-11 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <StackBadge key={item.name} item={item} />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
