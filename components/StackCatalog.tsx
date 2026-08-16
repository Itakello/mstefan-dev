"use client";

import { Icon } from "@iconify/react";
import type { CSSProperties } from "react";

import { StackBadge } from "@/components/StackBadge";
import {
  groupStackEntries,
  summarizeStackEntries,
  type StackEntry,
  type StackGroup,
} from "@/lib/stack";

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
      className="size-3.5 opacity-65"
      aria-hidden
    />
  );
}

const cardOffsets = [
  { rotation: "-2deg", offset: "1px" },
  { rotation: "2deg", offset: "0px" },
  { rotation: "-1deg", offset: "2px" },
  { rotation: "2.5deg", offset: "0px" },
] as const;

function StackHand({ entries }: { entries: readonly StackEntry[] }) {
  const { visibleEntries, hiddenEntries, overflowCount } = summarizeStackEntries(entries);

  return (
    <div className="stack-hand" aria-label={entries.map((entry) => entry.name).join(", ")}>
      {visibleEntries.map((item, index) => {
        const offset = cardOffsets[index % cardOffsets.length];
        const style = {
          "--stack-card-index": index,
          "--stack-card-rotation": offset.rotation,
          "--stack-card-offset": offset.offset,
        } as CSSProperties;

        return (
          <span key={item.name} className="stack-hand-card" style={style} tabIndex={0}>
            <StackBadge item={item} label={false} compact />
            <span className="stack-hand-label" aria-hidden>
              {item.name}
            </span>
          </span>
        );
      })}

      {overflowCount > 0 && (
        <span
          className="stack-overflow-card"
          title={hiddenEntries.map((entry) => entry.name).join(", ")}
        >
          +{overflowCount}
          <span className="sr-only">
            {` more: ${hiddenEntries.map((entry) => entry.name).join(", ")}`}
          </span>
        </span>
      )}
    </div>
  );
}

export function StackShelf({
  groups,
  label = "Technologies grouped by category",
}: {
  groups: readonly StackGroup[];
  label?: string;
}) {
  return (
    <div className="stack-shelf" aria-label={label}>
      <div className="stack-shelf-track">
        {groups.map(({ category, entries }) => (
          <section key={category} className="stack-shelf-group" aria-label={category}>
            <div className="stack-shelf-heading">
              <StackCategoryIcon category={category} />
              <span>{category}</span>
              <span className="text-black/40 dark:text-white/40">{entries.length}</span>
            </div>
            <StackHand entries={entries} />
          </section>
        ))}
      </div>
    </div>
  );
}

export function StackCatalog({ entries }: { entries: readonly StackEntry[] }) {
  const groups = groupStackEntries(entries);

  return <StackShelf groups={groups} label="Toolkit technologies grouped by category" />;
}
