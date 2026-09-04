import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const exactPaths = new Set([
  ".github/workflows/visual-review.yml",
  "middleware.ts",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "package.json",
  "playwright.config.js",
  "playwright.config.mjs",
  "playwright.config.ts",
  "pnpm-lock.yaml",
  "postcss.config.js",
  "postcss.config.mjs",
  "tailwind.config.js",
  "tailwind.config.ts",
  "tsconfig.json",
]);

const pathPrefixes = [
  ".codex/agents/playwright_test_",
  "app/",
  "components/",
  "e2e/",
  "lib/",
  "public/",
  "scripts/visual-review/",
  "specs/",
];

export function isUiImpactingPath(path) {
  return exactPaths.has(path) || pathPrefixes.some((prefix) => path.startsWith(prefix));
}

export function classifyVisualReview(paths, { force = false } = {}) {
  const normalized = [...new Set(paths.map((path) => path.trim()).filter(Boolean))].sort();
  const matched = normalized.filter(isUiImpactingPath);

  if (force) {
    return {
      run: true,
      reason: "forced by the visual-review pull-request label",
      changed: normalized,
      matched,
    };
  }

  return {
    run: matched.length > 0,
    reason: matched.length > 0
      ? `UI-impacting paths changed: ${matched.join(", ")}`
      : "no UI-impacting paths changed",
    changed: normalized,
    matched,
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function runCli() {
  const filesPath = argumentValue("--files");
  if (!filesPath) throw new Error("Usage: classify.mjs --files <newline-delimited-paths> [--force]");

  const result = classifyVisualReview(readFileSync(filesPath, "utf8").split("\n"), {
    force: process.argv.includes("--force"),
  });
  const outputPath = process.env.GITHUB_OUTPUT;
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;

  if (outputPath) appendFileSync(outputPath, `run=${result.run}\nreason=${result.reason}\n`);
  if (summaryPath) {
    appendFileSync(summaryPath, [
      "## Visual review classification",
      "",
      `**Decision:** ${result.run ? "run Playwright" : "skip Playwright"}`,
      "",
      `**Reason:** ${result.reason}`,
      "",
    ].join("\n"));
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) runCli();
