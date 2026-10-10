"use client";

import { Icon } from "@iconify/react";
import { useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { StackBadge } from "@/components/StackBadge";
import { getCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/config";
import {
  displayStackCategory,
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
  infrastructure: "lucide:cloud-cog",
  saas: "lucide:plug",
  cli: "lucide:square-terminal",
  integration: "lucide:plug",
};

export function StackCategoryIcon({ category, className = "size-3.5 opacity-65" }: { category: string; className?: string }) {
  return (
    <Icon
      icon={categoryIcons[category.toLowerCase()] ?? "lucide:box"}
      className={className}
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

type FloatingLabel = {
  name: string;
  position: Pick<CSSProperties, "left" | "right" | "top">;
};

function stackHandVariation(category: string, entries: readonly StackEntry[]) {
  const signature = `${category}:${entries.map((entry) => entry.name).join(":")}`;
  const seed = [...signature].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return seed % cardOffsets.length;
}

function StackHand({ category, entries, locale }: { category: string; entries: readonly StackEntry[]; locale: Locale }) {
  const copy = getCopy(locale);
  const { visibleEntries, hiddenEntries, overflowCount } = summarizeStackEntries(entries);
  const [showAll, setShowAll] = useState(false);
  const [floatingLabel, setFloatingLabel] = useState<FloatingLabel | null>(null);
  const focusedCard = useRef<{ element: HTMLElement; name: string } | null>(null);
  const hiddenEntriesId = useId();
  const variation = stackHandVariation(category, entries);

  const showLabel = (target: HTMLElement, name: string) => {
    const rect = target.getBoundingClientRect();
    const alignRight = rect.left + rect.width / 2 > window.innerWidth / 2;

    setFloatingLabel({
      name,
      position: {
        top: Math.min(rect.bottom + 6, window.innerHeight - 28),
        ...(alignRight
          ? { right: Math.max(window.innerWidth - rect.right, 8) }
          : { left: Math.max(rect.left, 8) }),
      },
    });
  };

  const restoreFocusedLabel = () => {
    const focused = focusedCard.current;
    if (focused) showLabel(focused.element, focused.name);
    else setFloatingLabel(null);
  };

  const renderCard = (item: StackEntry, index: number) => {
    const offset = cardOffsets[(index + variation) % cardOffsets.length];
    const style = {
      "--stack-card-index": entries.length - index,
      "--stack-card-rotation": offset.rotation,
      "--stack-card-offset": offset.offset,
    } as CSSProperties;

    return (
      <span
        key={item.name}
        className="stack-hand-card"
        style={style}
        tabIndex={0}
        onMouseEnter={(event) => showLabel(event.currentTarget, item.name)}
        onMouseLeave={restoreFocusedLabel}
        onFocus={(event) => {
          focusedCard.current = { element: event.currentTarget, name: item.name };
          showLabel(event.currentTarget, item.name);
        }}
        onBlur={() => {
          focusedCard.current = null;
          setFloatingLabel(null);
        }}
      >
        <StackBadge item={item} label={false} compact />
      </span>
    );
  };

  return (
    <div
      className="stack-hand"
      aria-label={copy.stack.technologyList(entries.map((entry) => entry.name).join(", "))}
      onMouseLeave={restoreFocusedLabel}
    >
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
          aria-label={showAll ? copy.stack.hideMore(overflowCount, category) : copy.stack.showMore(overflowCount, category)}
          onClick={() => setShowAll((current) => !current)}
          title={hiddenEntries.map((entry) => entry.name).join(", ")}
        >
          {showAll ? `−${overflowCount}` : `+${overflowCount}`}
        </button>
      )}

      {floatingLabel && createPortal(
        <span className="stack-floating-label" style={floatingLabel.position} aria-hidden>
          {floatingLabel.name}
        </span>,
        document.body,
      )}
    </div>
  );
}

export function ProjectStackHand({ entries, locale }: { entries: readonly StackEntry[]; locale: Locale }) {
  return <StackHand category={getCopy(locale).stack.projectCategory} entries={entries} locale={locale} />;
}

export function StackShelf({
  groups,
  locale,
  label,
}: {
  groups: readonly StackGroup[];
  locale: Locale;
  label: string;
}) {
  return (
    <div className="stack-shelf" aria-label={label}>
      <div className="stack-shelf-track">
        {groups.map(({ category, entries }) => {
          const displayCategory = displayStackCategory(category, locale);

          return (
            <section
              key={category}
              className="stack-shelf-group"
              aria-label={displayCategory}
            >
              <div className="stack-shelf-heading">
                <StackCategoryIcon category={category} />
                <span>{displayCategory}</span>
              </div>
              <StackHand category={displayCategory} entries={entries} locale={locale} />
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function StackCatalog({ entries, locale }: { entries: readonly StackEntry[]; locale: Locale }) {
  const groups = groupStackEntries(entries);

  return <StackShelf groups={groups} locale={locale} label={getCopy(locale).stack.toolkitTechnologiesByCategory} />;
}
