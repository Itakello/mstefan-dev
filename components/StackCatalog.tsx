"use client";

import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";

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
  { rotation: "-2.5deg", offset: "0px" },
  { rotation: "1deg", offset: "2px" },
] as const;

const projectShelfTransition = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.7,
} as const;

function stackHandVariation(category: string, entries: readonly StackEntry[]) {
  const signature = `${category}:${entries.map((entry) => entry.name).join(":")}`;
  const seed = [...signature].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return seed % cardOffsets.length;
}

function StackHand({ category, entries }: { category: string; entries: readonly StackEntry[] }) {
  const { visibleEntries, hiddenEntries, overflowCount } = summarizeStackEntries(entries);
  const [showAll, setShowAll] = useState(false);
  const hiddenEntriesId = useId();
  const variation = stackHandVariation(category, entries);

  const renderCard = (item: StackEntry, index: number) => {
    const offset = cardOffsets[(index + variation) % cardOffsets.length];
    const style = {
      "--stack-card-index": entries.length - index,
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
  };

  return (
    <div className="stack-hand" aria-label={entries.map((entry) => entry.name).join(", ")}>
      {visibleEntries.map(renderCard)}

      <span id={hiddenEntriesId} className="stack-hidden-cards" hidden={!showAll}>
        {hiddenEntries.map((item, index) => renderCard(item, visibleEntries.length + index))}
      </span>

      {overflowCount > 0 && (
        <button
          type="button"
          className="stack-overflow-card"
          aria-controls={hiddenEntriesId}
          aria-expanded={showAll}
          aria-label={`${showAll ? "Hide" : "Show"} ${overflowCount} more ${category} technologies`}
          onClick={() => setShowAll((current) => !current)}
          title={hiddenEntries.map((entry) => entry.name).join(", ")}
        >
          {showAll ? `−${overflowCount}` : `+${overflowCount}`}
        </button>
      )}
    </div>
  );
}

export function StackShelf({
  groups,
  label = "Technologies grouped by category",
  compact = false,
  animateLayout = false,
}: {
  groups: readonly StackGroup[];
  label?: string;
  compact?: boolean;
  animateLayout?: boolean;
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
    <div className={`stack-shelf-shell ${compact ? "stack-shelf-shell-compact" : ""}`}>
      <div ref={shelfRef} className="stack-shelf" aria-label={label}>
        <motion.div
          layout={animateLayout}
          transition={{ layout: projectShelfTransition }}
          className="stack-shelf-track"
        >
          {groups.map(({ category, entries }, groupIndex) => (
            <motion.section
              key={category}
              layout={animateLayout ? "position" : false}
              transition={{ layout: projectShelfTransition }}
              className="stack-shelf-group"
              aria-label={category}
            >
              <AnimatePresence initial={false}>
                {!compact && (
                  <motion.div
                    key="heading"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.16, delay: groupIndex * 0.018, ease: "easeOut" }}
                    className="stack-shelf-heading"
                  >
                    <StackCategoryIcon category={category} />
                    <span>{category}</span>
                  </motion.div>
                )}
              </AnimatePresence>
              <motion.div
                layout={animateLayout ? "position" : false}
                transition={{ layout: projectShelfTransition }}
              >
                <StackHand category={category} entries={entries} />
              </motion.div>
            </motion.section>
          ))}
        </motion.div>
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
