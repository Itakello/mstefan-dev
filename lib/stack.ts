import { getCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/config";

export type StackEntry = {
  name: string;
  category: string;
  iconKey: string;
  proficiency?: string;
  websiteVisible: boolean;
};

export type StackGroup = {
  category: string;
  entries: StackEntry[];
};

export type ProjectStackInput = {
  title: string;
  tags?: readonly string[];
  language?: string;
};

export const STACK_SHELF_VISIBLE_LIMIT = 4;

export function summarizeStackEntries(
  entries: readonly StackEntry[],
  limit = STACK_SHELF_VISIBLE_LIMIT,
) {
  const visibleEntries = entries.slice(0, limit);
  const hiddenEntries = entries.slice(limit);

  return {
    visibleEntries,
    hiddenEntries,
    overflowCount: hiddenEntries.length,
  };
}

const STACK_CATEGORY_ORDER = [
  "Language",
  "Framework",
  "Library",
  "Runtime",
  "Database",
  "Cloud",
  "Platform",
  "SaaS",
  "CLI",
] as const;

const ICONIFY_KEY = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9._-]*$/i;
const NOTION_ICON_ORIGIN = "https://s3-us-west-2.amazonaws.com";
const NOTION_ICON_PATH = "/public.notion-static.com/";

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

export function isIconifyKey(value: string) {
  return ICONIFY_KEY.test(value);
}

export function isTrustedExternalIcon(value: string) {
  try {
    const url = new URL(value);
    return url.origin === NOTION_ICON_ORIGIN && url.pathname.startsWith(NOTION_ICON_PATH);
  } catch {
    return false;
  }
}

export function isStackIconSource(value: string) {
  return isIconifyKey(value) || isTrustedExternalIcon(value);
}

export function stackIconUrl(value: string) {
  if (isTrustedExternalIcon(value)) return value;
  const [collection, icon] = value.split(":");
  return `https://api.iconify.design/${collection}/${icon}.svg`;
}

const aliases: Record<string, string> = {
  javascript: "JavaScript",
  js: "JavaScript",
  node: "Node.js",
  nodejs: "Node.js",
  powershell: "PowerShell",
  tailwind: "Tailwind CSS",
  tailwindcss: "Tailwind CSS",
  typescript: "TypeScript",
  ts: "TypeScript",
  github: "GitHub",
  latex: "LaTeX",
  npm: "npm",
  "scikit learn": "scikit-learn",
  sklearn: "scikit-learn",
  tensorflow: "TensorFlow",
  vscode: "VS Code"
};

export function findStackEntry(
  label: string,
  catalog: readonly StackEntry[]
): StackEntry | undefined {
  const normalized = normalize(label);
  const canonical = aliases[normalized];
  return catalog.find((item) => normalize(item.name) === normalize(canonical ?? label));
}

export function resolveProjectStack(
  labels: readonly string[],
  catalog: readonly StackEntry[]
): StackEntry[] {
  const resolved = new Map<string, StackEntry>();

  for (const label of labels) {
    const item = findStackEntry(label, catalog);
    if (item) resolved.set(normalize(item.name), item);
  }

  return [...resolved.values()];
}

export function projectStackLabels({ language, tags }: Pick<ProjectStackInput, "language" | "tags">) {
  const detectedLanguage = language || tags?.find((tag) => KNOWN_LANGUAGES.has(tag));
  const nonLanguageTags = (tags ?? []).filter((tag) => !KNOWN_LANGUAGES.has(tag));

  return [detectedLanguage, ...nonLanguageTags].filter(
    (label): label is string => Boolean(label),
  );
}

export function assertProjectStackCoverage(
  projects: readonly ProjectStackInput[],
  catalog: readonly StackEntry[],
) {
  const missing = projects.flatMap((project) => {
    const labels = projectStackLabels(project);
    const unresolved = labels.filter((label) => !findStackEntry(label, catalog));
    return unresolved.map((label) => `${project.title}: ${label}`);
  });

  if (missing.length > 0) {
    throw new Error(`Cannot publish projects with missing Stack entries: ${missing.join(", ")}`);
  }
}

export function groupStackEntries(entries: readonly StackEntry[]): StackGroup[] {
  const groups = new Map<string, StackEntry[]>();

  for (const entry of entries) {
    const group = groups.get(entry.category) ?? [];
    group.push(entry);
    groups.set(entry.category, group);
  }

  const categoryRank = new Map<string, number>(
    STACK_CATEGORY_ORDER.map((category, index) => [normalize(category), index]),
  );

  return [...groups.entries()]
    .sort(([left], [right]) => {
      const leftRank = categoryRank.get(normalize(left)) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = categoryRank.get(normalize(right)) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.localeCompare(right);
    })
    .map(([category, group]) => ({
      category,
      entries: [...group].sort((left, right) => left.name.localeCompare(right.name)),
    }));
}

export function displayStackCategory(category: string, locale: Locale) {
  return getCopy(locale).stack.categories[normalize(category)] ?? category;
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
}
