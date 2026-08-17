"use client";

import { Icon } from "@iconify/react";

import { isTrustedExternalIcon, type StackEntry } from "@/lib/stack";

type Props = {
  item: StackEntry;
  label?: boolean;
  compact?: boolean;
};

export function StackBadge({ item, label = true, compact = false }: Props) {
  return (
    <span
      className={label ? "inline-flex items-center gap-2 text-xs text-black/70 dark:text-white/75" : "inline-flex"}
    >
      <span
        className={`stack-badge-icon grid shrink-0 place-items-center overflow-hidden rounded-md border border-black/10 bg-black/[0.025] dark:border-white/10 dark:bg-white/[0.035] ${compact ? "size-7" : "size-9"}`}
      >
        {isTrustedExternalIcon(item.iconKey) ? (
          <img
            src={item.iconKey}
            alt=""
            className={`${compact ? "size-4" : "size-5"} object-contain`}
            aria-hidden
          />
        ) : (
          <Icon icon={item.iconKey} className={compact ? "size-4" : "size-5"} aria-hidden />
        )}
      </span>
      {label && <span className="font-medium">{item.name}</span>}
      {!label && <span className="sr-only">{item.name}</span>}
    </span>
  );
}
