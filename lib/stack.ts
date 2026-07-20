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

export const fallbackStack: StackEntry[] = [
  entry("Python", "Language", "logos:python"),
  entry("JavaScript", "Language", "logos:javascript"),
  entry("TypeScript", "Language", "logos:typescript-icon"),
  entry("PostgreSQL", "Database", "logos:postgresql"),
  entry("TensorFlow", "Library", "logos:tensorflow"),
  entry("scikit-learn", "Library", "devicon:scikitlearn"),
  entry("Regex", "Tool", "mdi:regex"),
  entry("Docker", "Platform", "logos:docker-icon"),
  entry("Azure", "Cloud", "logos:microsoft-azure"),
  entry("Cloudflare", "Cloud", "logos:cloudflare-icon"),
  entry("Supabase", "Database", "logos:supabase-icon"),
  entry("Vercel", "Platform", "skill-icons:vercel-dark"),
  entry("Terraform", "Platform", "logos:terraform-icon"),
  entry("Kubernetes", "Platform", "logos:kubernetes"),
  entry("Node.js", "Runtime", "logos:nodejs-icon"),
  entry("Tailwind CSS", "Framework", "logos:tailwindcss-icon"),
  entry("Java", "Language", "logos:java"),
  entry("C++", "Language", "logos:c-plusplus"),
  entry("Bash", "CLI", "skill-icons:bash-dark"),
  entry("PowerShell", "CLI", "devicon:powershell"),
  entry("HTML", "Language", "logos:html-5"),
  entry("CSS", "Language", "logos:css-3"),
  entry("Markdown", "Language", "skill-icons:markdown-dark"),
  entry("Notion", "SaaS", "skill-icons:notion-dark"),
  entry("npm", "CLI", "logos:npm-icon"),
  entry("Discord", "SaaS", "logos:discord-icon"),
  entry("Git", "CLI", "logos:git-icon"),
  entry("GitHub", "SaaS", "skill-icons:github-dark"),
  entry("VS Code", "Editor", "logos:visual-studio-code"),
  entry("Anaconda", "Tool", "devicon:anaconda"),
  entry("Make", "CLI", "material-icon-theme:makefile"),
  entry("LaTeX", "Language", "skill-icons:latex-dark"),
  entry("Apple", "Platform", "skill-icons:apple-dark"),
  entry("Linux", "Operating system", "logos:linux-tux"),
  entry("Ubuntu", "Operating system", "logos:ubuntu"),
  entry("Windows", "Operating system", "logos:microsoft-windows-icon")
];

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
  catalog: readonly StackEntry[] = fallbackStack
): StackEntry | undefined {
  const normalized = normalize(label);
  const canonical = aliases[normalized];
  return catalog.find((item) => normalize(item.name) === normalize(canonical ?? label));
}

export function resolveProjectStack(
  labels: readonly string[],
  catalog: readonly StackEntry[] = fallbackStack
): StackEntry[] {
  const resolved = new Map<string, StackEntry>();

  for (const label of labels) {
    const item = findStackEntry(label, catalog);
    if (item) resolved.set(normalize(item.name), item);
  }

  return [...resolved.values()];
}

function entry(name: string, category: string, iconKey: string): StackEntry {
  return { name, category, iconKey, websiteVisible: true };
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
}
