export type StackEntry = {
  name: string;
  category: string;
  iconKey: string;
  proficiency?: string;
  websiteVisible: boolean;
};

const ICONIFY_KEY = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9._-]*$/i;
const NOTION_ICON_ORIGIN = "https://s3-us-west-2.amazonaws.com";
const NOTION_ICON_PATH = "/public.notion-static.com/";

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

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
}
