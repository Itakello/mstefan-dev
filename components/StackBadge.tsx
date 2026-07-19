"use client";

import { Icon } from "@iconify/react";

import type { StackEntry } from "@/lib/stack";

export function StackBadge({ item }: { item: StackEntry }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs border-black/10 bg-black/[0.03] text-black/70 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
      <Icon icon={item.iconKey} className="text-base" aria-hidden />
      <span>{item.name}</span>
    </span>
  );
}
