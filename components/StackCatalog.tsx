"use client";

import { Icon } from "@iconify/react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

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
          "--stack-card-index": visibleEntries.length - index,
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
  const shelfRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollControls = useCallback(() => {
    const shelf = shelfRef.current;

    if (!shelf) return;

    setCanScrollLeft(shelf.scrollLeft > 1);
    setCanScrollRight(shelf.scrollLeft + shelf.clientWidth < shelf.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const shelf = shelfRef.current;

    if (!shelf) return;

    updateScrollControls();
    shelf.addEventListener("scroll", updateScrollControls, { passive: true });

    const resizeObserver = new ResizeObserver(updateScrollControls);
    resizeObserver.observe(shelf);
    const track = shelf.firstElementChild;
    if (track) resizeObserver.observe(track);

    return () => {
      shelf.removeEventListener("scroll", updateScrollControls);
      resizeObserver.disconnect();
    };
  }, [groups, updateScrollControls]);

  const scroll = (direction: -1 | 1) => {
    const shelf = shelfRef.current;

    if (!shelf) return;

    shelf.scrollBy({
      left: direction * Math.max(shelf.clientWidth * 0.7, 160),
      behavior: "smooth",
    });
  };

  return (
    <div className="stack-shelf-shell">
      <div ref={shelfRef} className="stack-shelf" aria-label={label}>
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

      <button
        type="button"
        className="stack-shelf-arrow stack-shelf-arrow-left"
        aria-label="Scroll technologies left"
        disabled={!canScrollLeft}
        onClick={() => scroll(-1)}
      >
        <Icon icon="lucide:chevron-left" aria-hidden />
      </button>
      <button
        type="button"
        className="stack-shelf-arrow stack-shelf-arrow-right"
        aria-label="Scroll technologies right"
        disabled={!canScrollRight}
        onClick={() => scroll(1)}
      >
        <Icon icon="lucide:chevron-right" aria-hidden />
      </button>
    </div>
  );
}

export function StackCatalog({ entries }: { entries: readonly StackEntry[] }) {
  const groups = groupStackEntries(entries);

  return <StackShelf groups={groups} label="Toolkit technologies grouped by category" />;
}
