import { ArrowUpRight, Code } from "lucide-react";

type Props = {
  title: string;
  summary: string;
  year?: string;
  url?: string;
  tags?: string[];
  language?: string;
};

export function ProjectCard({ title, summary, year, url, tags, language }: Props) {
  const KNOWN_LANGUAGES = new Set([
    "JavaScript",
    "TypeScript",
    "Python",
    "Java",
    "C++",
    "C#",
    "Go",
    "Rust",
    "Ruby",
    "PHP",
    "Kotlin",
    "Swift",
    "Scala",
    "Dart",
  ]);

  const detectedLanguage =
    language || (tags || []).find((t) => KNOWN_LANGUAGES.has(t));
  const nonLanguageTags = (tags || []).filter((t) => !KNOWN_LANGUAGES.has(t));

  return (
    <a
      href={url || "#"}
      className="card block p-6 no-underline hover:border-accent"
      target={url ? "_blank" : undefined}
      rel={url ? "noreferrer" : undefined}
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <ArrowUpRight className="size-4 opacity-70" />
      </div>
      <p className="mt-2 text-sm text-black/70 dark:text-white/80">{summary}</p>
      {nonLanguageTags && nonLanguageTags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {nonLanguageTags.map((t) => (
            <span
              key={t}
              className="rounded-full border px-2.5 py-1 text-xs border-black/10 bg-black/[0.03] text-black/70 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      {detectedLanguage && (
        <div className="mt-3 inline-flex items-center gap-2 text-xs text-black/60 dark:text-white/70">
          <Code className="size-4 opacity-70" />
          <span className="font-medium">{detectedLanguage}</span>
        </div>
      )}
      {/* Year intentionally not shown on the card; grouping is by year above */}
    </a>
  );
}
