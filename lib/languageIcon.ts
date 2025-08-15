// Map common languages to Iconify icon names (prefer devicon/logos sets)
// You can extend/override this list anytime.
const languageToIconKey: Record<string, string> = {
  JavaScript: "logos:javascript",
  TypeScript: "logos:typescript-icon",
  Python: "logos:python",
  Java: "logos:java",
  "C++": "devicon:cplusplus",
  "C#": "devicon:csharp",
  Go: "logos:go",
  Rust: "logos:rust",
  Ruby: "logos:ruby",
  PHP: "logos:php",
  Kotlin: "logos:kotlin-icon",
  Swift: "logos:swift",
  Scala: "logos:scala",
  Dart: "logos:dart",
  PHP8: "logos:php",
  Shell: "mdi:shell",
  Bash: "mdi:shell",
};

export function getIconKeyForLanguage(language?: string | null): string | undefined {
  if (!language) return undefined;
  const normalized = String(language).trim();
  if (languageToIconKey[normalized]) return languageToIconKey[normalized];
  // Loose matching
  const lower = normalized.toLowerCase();
  if (lower.includes("typescript")) return languageToIconKey.TypeScript;
  if (lower.includes("javascript")) return languageToIconKey.JavaScript;
  if (lower === "c++" || lower.includes("cplusplus")) return languageToIconKey["C++"];
  if (lower === "c#" || lower.includes("csharp")) return languageToIconKey["C#"];
  return undefined;
}


