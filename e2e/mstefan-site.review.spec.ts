// spec: specs/mstefan-site-review.md
// seed: e2e/seed.ts

import { writeFile } from "node:fs/promises";

import { expect, showReviewStep, test } from "./seed";

test.describe("Public website review", () => {
  test.beforeEach(async ({ context }) => {
    const base = process.env.PLAYWRIGHT_BASE_URL;
    const state = process.env.VISUAL_NOTION_FIXTURE_STATE;
    if (!base || !state) throw new Error("The isolated offline publication fixture is required");
    await writeFile(state, "multiple");
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (["www.mstefan.dev", "mstefan.dev"].includes(url.hostname)) {
        const response = await route.fetch({ url: `${base}${url.pathname}${url.search}`, maxRedirects: 0 });
        await route.fulfill({ response });
      } else if (url.hostname === "www.thekarakaltimes.com") {
        await route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>${url.pathname === "/about" ? "Karakal about fixture" : "The Karakal Times fixture"}</h1><a href="/about">About</a></body></html>` });
      } else if (url.hostname === "api.iconify.design") {
        const prefix = url.pathname.split("/")[1].replace(/\.json$/, "");
        await route.fulfill({ json: { prefix, icons: {}, not_found: (url.searchParams.get("icons") || "").split(",") } });
      } else if (url.origin === new URL(base).origin) {
        await route.continue();
      } else {
        throw new Error(`Unexpected external browser request: ${url.hostname}`);
      }
    });
  });
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
    await page.goto("https://www.mstefan.dev/en");
    await expect(page.getByRole("heading", { level: 1, name: "I build AI systems for real work." })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Selected work" })).toBeVisible();
    const career = page.getByRole("region", { name: "Career", exact: true });
    await expect(career).toBeVisible();
    await expect(career.locator("button[data-career-job]", { hasText: "Amazon" })).toHaveAttribute("aria-pressed", "true");
    await expect(career.locator("button[data-career-job]").getByText("work/amazon", { exact: true })).toBeVisible();
    await expect(career.getByRole("region", { name: /Graph.*Time moves upward/ })).toBeVisible();
    await page.screenshot({ path: ".artifacts/playwright/career-home-desktop.png", fullPage: true });
    await career.getByRole("link", { name: "Explore my background" }).click();
    await expect(page).toHaveURL(/\/en\/about#career$/);
    await expect(page.getByRole("region", { name: "Career", exact: true })).toBeVisible();
    await page.goto("/en");
    await showReviewStep(page, "1 · English home, career and selected work");

    // 2. Select work and browse the independent desktop and phone previews.
    await page.getByRole("link", { name: "Work", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/projects$/);
    await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();

    await page.getByRole("button", { name: "Select mstefan.dev", exact: true }).click();
    const projectStack = page.getByRole("complementary", { name: "mstefan.dev technologies grouped by category" });
    await expect(projectStack.getByText("TypeScript", { exact: true })).toBeVisible();
    await expect(projectStack.getByText("Python", { exact: true })).toHaveCount(0);
    const desktop = page.frameLocator('iframe[title="Desktop: Interactive preview of mstefan.dev"]');
    const mobile = page.frameLocator('iframe[title="Mobile: Interactive preview of mstefan.dev"]');
    const modes = page.getByRole("group", { name: "Preview size" });
    await expect(page.locator("iframe")).toHaveCount(1);
    await expect(desktop.getByRole("heading", { level: 1, name: "I build AI systems for real work." })).toBeVisible();
    await expect(modes.getByRole("button", { name: "Desktop", exact: true })).toHaveAttribute("aria-pressed", "true");
    const stageHeight = await page.locator("iframe").evaluate(node => node.parentElement?.parentElement?.getBoundingClientRect().height);
    const frame = await page.locator("iframe").elementHandle().then(handle => handle?.contentFrame());
    expect(await frame?.evaluate(() => window.innerWidth)).toBe(1280);
    const header = await page.getByRole("link", { name: "Visit website", exact: true }).boundingBox();
    const preview = await page.locator("iframe").boundingBox();
    expect(header && preview && header.y + header.height < preview.y).toBeTruthy();
    await page.locator("#playwright-review-step").evaluate(node => node.remove());
    await page.screenshot({ path: ".artifacts/playwright/work-desktop.png", fullPage: true });
    await desktop.getByRole("link", { name: "About", exact: true }).click();
    await expect(desktop.getByRole("heading", { level: 1, name: "About", exact: true })).toBeVisible();
    await modes.getByRole("button", { name: "Mobile", exact: true }).click();
    await expect(page.locator("iframe")).toHaveCount(1);
    await expect(mobile.getByRole("heading", { level: 1, name: "About", exact: true })).toBeVisible();
    await expect(modes.getByRole("button", { name: "Mobile", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await frame?.evaluate(() => window.innerWidth)).toBe(390);
    expect(await page.locator("iframe").evaluate(node => node.parentElement?.parentElement?.getBoundingClientRect().height)).toBe(stageHeight);
    await page.screenshot({ path: ".artifacts/playwright/work-phone.png", fullPage: true });
    await modes.getByRole("button", { name: "Desktop", exact: true }).click();
    await expect(desktop.getByRole("heading", { level: 1, name: "About", exact: true })).toBeVisible();
    expect(await frame?.evaluate(() => window.innerWidth)).toBe(1280);
    const clientSelection = page.getByRole("navigation", { name: "Choose a project" }).getByRole("button", { name: "Select The Karakal Times" });
    await clientSelection.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("iframe")).toHaveCount(1);
    await expect(page.locator("iframe")).toHaveAttribute("src", "https://www.thekarakaltimes.com/en");
    await expect(page.frameLocator("iframe").getByRole("heading", { name: "The Karakal Times fixture" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Visit website", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Source code", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Select Automation tools", exact: true }).click();
    const repositoryStack = page.getByRole("complementary", { name: "Automation tools technologies grouped by category" });
    await expect(repositoryStack.getByText("Python", { exact: true })).toBeVisible();
    await expect(repositoryStack.getByText("TypeScript", { exact: true })).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Preview size" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Source code", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Visit website", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Select mstefan.dev", exact: true }).click();
    await expect(desktop.getByRole("heading", { level: 1, name: "I build AI systems for real work." })).toBeVisible();
    await showReviewStep(page, "2 · Work explorer and responsive preview toggle");

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
    await expect(page).toHaveURL(/\/it\/projects$/);
    await page.getByRole("button", { name: "Seleziona lingua" }).click();
    await page.getByRole("menuitemradio", { name: /English/ }).click();
    await expect(page).toHaveURL(/\/en\/projects$/);
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
    const mobileCareer = page.getByRole("region", { name: "Career", exact: true });
    await expect(mobileCareer).toBeVisible();
    await expect(mobileCareer.getByText("Dates not provided").first()).toBeVisible();
    const mobileBranch = mobileCareer.locator('svg [data-career-branch]');
    await mobileBranch.focus();
    await mobileBranch.press("Enter");
    await expect(mobileBranch).toHaveAttribute("aria-pressed", "true");
    await expect(mobileCareer.locator('button[data-career-job]')).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => mobileCareer.locator('[aria-label^="Graph."]').evaluate((tree) => {
      const main = tree.querySelector('circle')!.getBoundingClientRect();
      const viewport = tree.getBoundingClientRect();
      return main.left >= viewport.left && main.right <= viewport.right;
    })).toBe(true);
    await page.screenshot({ path: ".artifacts/playwright/career-home-mobile.png", fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.setViewportSize({ width: 400, height: 800 });
    await expect(page.locator("footer > div")).toHaveCSS("flex-direction", "row");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.goto("/it");
    await expect(page.getByRole("region", { name: "Percorso", exact: true })).toBeVisible();
    await expect(page.locator("footer > div")).toHaveCSS("flex-direction", "row");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(browserErrors, browserErrors.join("\n")).toEqual([]);
  });

  test("Website previews stop after three same-origin ancestors", async ({ page }) => {
    await page.goto("/en/websites");
    await expect(page).toHaveURL(/\/en\/projects$/);
    await page.goto("https://www.mstefan.dev/en/projects");
    await page.getByRole("button", { name: "Select mstefan.dev", exact: true }).click();
    let frame = page.mainFrame();
    for (let depth = 1; depth <= 3; depth++) {
      await expect(frame.locator("iframe")).toHaveCount(1);
      const child = frame.locator('iframe[title="Desktop: Interactive preview of mstefan.dev"]').contentFrame();
      await expect(child.getByRole("heading", { level: 1 })).toBeVisible();
      const menu = child.getByRole("button", { name: "Open navigation", exact: true });
      if (await menu.isVisible()) await menu.click();
      await child.getByRole("link", { name: "Work", exact: true }).click();
      await child.getByRole("button", { name: "Select mstefan.dev", exact: true }).click();
      const actual = await frame.locator('iframe[title="Desktop: Interactive preview of mstefan.dev"]').elementHandle().then(handle => handle?.contentFrame());
      if (!actual) throw new Error(`Missing preview frame at depth ${depth}`);
      frame = actual;
    }
    await expect(frame.locator("iframe")).toHaveCount(0);
    await expect(frame.getByRole("link", { name: "Visit website", exact: true })).toBeVisible();
    await page.screenshot({ path: ".artifacts/playwright/gallery-depth-limit.png", fullPage: true });
  });

  test("Gallery handles one, empty, and unavailable publication states", async ({ page }) => {
    const state = process.env.VISUAL_NOTION_FIXTURE_STATE;
    if (!state) throw new Error("Missing publication fixture state");
    await writeFile(state, "one");
    await page.goto("/it/websites");
    await expect(page.getByRole("navigation", { name: "Scegli un progetto" }).getByRole("button")).toHaveCount(1);
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: ".artifacts/playwright/gallery-mobile.png", fullPage: true });
    await writeFile(state, "empty");
    await page.reload();
    await expect(page.locator('[data-project-publication-status="empty"]')).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
    await writeFile(state, "error");
    await page.reload();
    await expect(page.locator('[data-project-publication-status="error"]')).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
  });
});
