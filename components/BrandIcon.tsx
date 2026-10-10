"use client";

import { Icon } from "@iconify/react";
import { BRAND_ICON_CLASS } from "@/lib/iconStyles";

const icons = {
  github: "simple-icons:github",
  linkedin: "simple-icons:linkedin",
  x: "simple-icons:x",
} as const;

export function BrandIcon({ brand }: { brand: keyof typeof icons }) {
  return <Icon icon={icons[brand]} className={BRAND_ICON_CLASS} data-brand-icon={brand} aria-hidden />;
}
