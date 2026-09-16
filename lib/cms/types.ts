import type { getCopy } from "@/lib/i18n/copy";

export type PageImage = { id: number; url?: string | null; width?: number | null; height?: number | null };
export type PageContent<T extends "home" | "about"> = ReturnType<typeof getCopy>[T] &
  (T extends "about" ? { photo?: PageImage | number | null } : {});
