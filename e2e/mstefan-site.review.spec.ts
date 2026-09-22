// spec: specs/mstefan-site-review.md
// seed: e2e/seed.ts

import { expect, showReviewStep, test } from "./seed";

test.describe("Public website review", () => {
  test("Review the primary bilingual visitor journey", async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(`Uncaught page error: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(`Console error: ${message.text()}`);
    });

    await page.addInitScript(() => {
      try { localStorage.setItem("theme", "light"); } catch {}
    });

    // 1. Open the English home page and verify the primary introduction.
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1, name: "I build AI systems for real work." })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Selected work" })).toBeVisible();
    await showReviewStep(page, "1 · English home and selected work");

    // 2. Open Work and switch between projects and websites.
    await page.getByRole("link", { name: "Work", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/projects$/);
    await expect(page.getByRole("heading", { level: 1, name: "Public projects" })).toBeVisible();
    await page.getByRole("navigation", { name: "Browse work" }).getByRole("link", { name: "Websites" }).click();
    await expect(page).toHaveURL(/\/en\/websites$/);
    await expect(page.frameLocator('iframe[title="Interactive preview of mstefan.dev"]').getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("group", { name: "Choose a website to explore" }).getByRole("button", { name: "Select The Karakal Times" }).click();
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open The Karakal Times in a new tab" }).last()).toBeVisible();
    await showReviewStep(page, "2 · Projects and website gallery");

    // 3. Open About and verify its portrait and biography.
    await page.getByRole("link", { name: "About", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/about$/);
    await expect(page.getByRole("heading", { level: 1, name: "About" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Massimo Stefan standing in an elevator, holding a laptop" })).toBeVisible();
    await showReviewStep(page, "3 · About and portrait");

    // 4. Toggle dark mode and verify the rendered theme state.
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await showReviewStep(page, "4 · Dark theme");

    // 5. Switch to Italian and verify localized navigation and content.
    await page.getByRole("button", { name: "Select language" }).click();
    await page.getByRole("menuitemradio", { name: /Italiano/ }).click();
    await expect(page).toHaveURL(/\/it\/about$/);
    await expect(page.getByRole("heading", { level: 1, name: "Profilo" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Lavori", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Lavori", exact: true }).click();
    await page.getByRole("navigation", { name: "Esplora i lavori" }).getByRole("link", { name: "Siti web" }).click();
    await expect(page).toHaveURL(/\/it\/websites$/);
    await page.getByRole("button", { name: "Seleziona lingua" }).click();
    await page.getByRole("menuitemradio", { name: /English/ }).click();
    await expect(page).toHaveURL(/\/en\/websites$/);
    await showReviewStep(page, "5 · Italian localization");

    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() { throw new DOMException("blocked", "SecurityError"); },
      });
    });
    await page.goto("/en");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expect(page.getByRole("button", { name: "Toggle theme" }).first().locator(".lucide-sun")).toBeVisible();
    await page.getByRole("button", { name: "Toggle theme" }).first().click();
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/en");
    await expect(page.locator("footer > div")).toHaveCSS("flex-direction", "column");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.setViewportSize({ width: 400, height: 800 });
    await expect(page.locator("footer > div")).toHaveCSS("flex-direction", "row");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.goto("/it");
    await expect(page.locator("footer > div")).toHaveCSS("flex-direction", "row");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(browserErrors, browserErrors.join("\n")).toEqual([]);
  });
});
