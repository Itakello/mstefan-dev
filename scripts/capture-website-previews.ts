import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { supportedLocales } from "../lib/i18n/config";
import { fetchProjectsFromNotion } from "../lib/notion";
import { approvedWebsiteUrls, websitePreviewUrl } from "../lib/websiteShowcase";
import { websiteScreenshotPaths } from "../lib/websiteScreenshots";

// Explicit URLs refresh assets only; Notion still controls gallery membership.
const supplied = process.argv.slice(2);
const projects = supplied.length ? supplied.map(websiteUrl => ({ websiteUrl })) : await fetchProjectsFromNotion();
if (!projects) throw new Error("Configure NOTION_TOKEN and NOTION_DATABASE_ID, or supply public website URLs.");
const urls = approvedWebsiteUrls(projects).filter((url): url is string => Boolean(url));
const browser = await chromium.launch();
try {
  for (const url of urls) {
    for (const locale of supportedLocales) {
      const paths = websiteScreenshotPaths(url, locale);
      for (const [mode, viewport] of Object.entries({ desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } })) {
        const context = await browser.newContext({ viewport, colorScheme: "light", locale: locale === "it" ? "it-IT" : "en-US", serviceWorkers: "block", isMobile: mode === "mobile", hasTouch: mode === "mobile" });
        const destination = path.join("public", paths[mode as keyof typeof paths]);
        const temporary = `${destination}.tmp`;
        try {
          const page = await context.newPage();
          const target = websitePreviewUrl({ id: url, url, preview: true, name: "", description: "" }, locale)!;
          const response = await page.goto(target, { waitUntil: "load", timeout: 30_000 });
          if (!response?.ok()) throw new Error(`Capture failed: ${response?.status() ?? "no response"}`);
          await page.evaluate(() => Promise.race([
            Promise.all([document.fonts.ready, ...[...document.images]
              .filter(image => image.loading !== "lazy").map(image => image.decode())]),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Screenshot assets timed out")), 10_000)),
          ]));
          await mkdir(path.dirname(destination), { recursive: true });
          await page.screenshot({ path: temporary, type: "png", animations: "disabled", timeout: 15_000 });
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
