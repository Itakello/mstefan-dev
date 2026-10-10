import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { supportedLocales } from "../lib/i18n/config";
import { fetchProjectsFromNotion } from "../lib/notion";
import { approvedWebsiteUrls, websitePreviewTargets, websitePreviewUrl } from "../lib/websiteShowcase";
import { websiteScreenshotPaths } from "../lib/websiteScreenshots";
import { configurePreviewNetwork, configurePreviewPageNetwork } from "./website-preview-network";

// Explicit URLs refresh assets only; Notion still controls gallery membership.
const supplied = process.argv.slice(2);
const projects = supplied.length ? supplied.map(websiteUrl => ({ websiteUrl })) : await fetchProjectsFromNotion();
if (!projects) throw new Error("Configure NOTION_TOKEN and NOTION_DATABASE_ID, or supply public website URLs.");
approvedWebsiteUrls(projects);
const urls = projects.flatMap(websitePreviewTargets);
if (urls.length > 100) throw new Error("Preview refresh exceeds the 100-page limit.");
const output = process.env.WEBSITE_PREVIEW_OUTPUT_DIR || "public";
const browserEnvironment = Object.fromEntries(Object.entries(process.env)
  .filter(([key, value]) => value !== undefined && ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "DISPLAY", "XDG_RUNTIME_DIR"].includes(key))) as Record<string, string>;
const browser = await chromium.launch({ env: browserEnvironment });
try {
  for (const url of urls) {
    for (const locale of supportedLocales) {
      const paths = websiteScreenshotPaths(url, locale);
      for (const [mode, viewport] of Object.entries({ desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } })) {
        const context = await browser.newContext({ viewport, colorScheme: "dark", locale: locale === "it" ? "it-IT" : "en-US", serviceWorkers: "block", isMobile: mode === "mobile", hasTouch: mode === "mobile" });
        const destination = path.join(output, paths[mode as keyof typeof paths]);
        const temporary = `${destination}.tmp`;
        try {
          await configurePreviewNetwork(context);
          const page = await context.newPage();
          await configurePreviewPageNetwork(page);
          const target = websitePreviewUrl({ id: url, url, preview: true, name: "", description: "" }, locale)!;
          const response = await page.goto(target, { waitUntil: "load", timeout: 30_000 });
          if (!response?.ok()) throw new Error(`Capture failed: ${response?.status() ?? "no response"}`);
          await page.evaluate(() => Promise.race([
            Promise.all([document.fonts.ready, ...[...document.images]
              .filter(image => image.loading !== "lazy").map(image => image.decode())]),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Screenshot assets timed out")), 10_000)),
          ]));
          await mkdir(path.dirname(destination), { recursive: true });
          const image = await page.screenshot({ path: temporary, type: "png", animations: "disabled", timeout: 15_000 });
          if (image.length > 2_000_000) throw new Error("Screenshot exceeds the 2 MB limit.");
          await rename(temporary, destination);
          console.log(`Captured ${locale} ${mode}: ${destination}`);
        } finally {
          await context.close();
          await rm(temporary, { force: true });
        }
      }
    }
  }
} finally {
  await browser.close();
}
