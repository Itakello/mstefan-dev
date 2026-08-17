import type { Locale } from "@/lib/i18n/config";

type ProjectPreview = {
  summary: string;
  shortSummary?: string;
};

export function projectPreviewSummary(project: ProjectPreview) {
  return project.shortSummary ?? project.summary;
}

export function formatProjectStartDate(locale: Locale, value: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
