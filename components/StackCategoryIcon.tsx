"use client";

import { Icon } from "@iconify/react";

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
