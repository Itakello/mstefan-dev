// spec: specs/mstefan-site-review.md
// seed: e2e/seed.ts

import { readFile, writeFile } from "node:fs/promises";

import { expect, showReviewStep, test } from "./seed";

test.describe("Public website review", () => {
  test.beforeEach(async ({ context }) => {
    const base = process.env.PLAYWRIGHT_BASE_URL;
    const state = process.env.VISUAL_NOTION_FIXTURE_STATE;
    if (!base || !state) throw new Error("The isolated offline publication fixture is required");
    await writeFile(state, "multiple");
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.hostname === "example.com" && url.pathname.endsWith(".pdf")) {
        await route.fulfill({ body: await readFile("tests/fixtures/research.pdf"), contentType: "application/pdf", headers: { "access-control-allow-origin": "*" } });
      } else if (["www.mstefan.dev", "mstefan.dev"].includes(url.hostname)) {
        const response = await route.fetch({ url: `${base}${url.pathname}${url.search}`, maxRedirects: 0 });
        await route.fulfill({ response });
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
    await expect(page.getByRole("button", { name: "Select mstefan.dev", exact: true }).getByText("Website", { exact: true })).toBeVisible();
    const projectStack = page.getByRole("complementary", { name: "mstefan.dev technologies grouped by category" });
    const typeScript = projectStack.locator('summary[aria-label="TypeScript · Language"]');
    await typeScript.focus();
    await expect(page.getByText("TypeScript", { exact: true }).last()).toBeVisible();
    await typeScript.click();
    await expect(projectStack.locator("details[open]")).toHaveCount(1);
    await page.evaluate(() => window.scrollBy(0, 30));
    await expect(page.locator("[data-work-stack-label]")).toHaveCount(0);
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
    await expect(desktop.locator("#career-story")).toHaveAttribute("aria-label", "About");
    await expect(desktop.getByRole("heading", { level: 1, name: "main", exact: true })).toBeVisible();
    await modes.getByRole("button", { name: "Mobile", exact: true }).click();
    await expect(page.locator("iframe")).toHaveCount(1);
    await expect(mobile.locator("#career-story")).toHaveAttribute("aria-label", "About");
    await expect(modes.getByRole("button", { name: "Mobile", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await frame?.evaluate(() => window.innerWidth)).toBe(390);
    const mobileGeometry = await page.locator("iframe").evaluate(node => ({
      width: node.getBoundingClientRect().width,
      availableWidth: node.parentElement?.parentElement?.getBoundingClientRect().width,
    }));
    expect(Math.abs(mobileGeometry.width - (mobileGeometry.availableWidth ?? 0))).toBeLessThan(2);
    expect(await page.locator("iframe").evaluate(node => node.parentElement?.parentElement?.getBoundingClientRect().height)).toBe(stageHeight);
    await page.screenshot({ path: ".artifacts/playwright/work-phone.png", fullPage: true });
    await modes.getByRole("button", { name: "Desktop", exact: true }).click();
    await expect(desktop.getByRole("heading", { level: 1, name: "main", exact: true })).toBeVisible();
    expect(await frame?.evaluate(() => window.innerWidth)).toBe(1280);
    const clientSelection = page.getByRole("navigation", { name: "Choose a project" }).getByRole("button", { name: "Select The Karakal Times" });
    await clientSelection.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByText("Explore the live website in a new tab.")).toBeVisible();
    await expect(page).toHaveURL(/\/en\/projects$/);
    await expect(page.getByRole("link", { name: "Visit website", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Source code", exact: true })).toHaveCount(0);
    await page.goto("/en/projects?project=Automation%20tools");
    await expect(page.getByRole("region", { name: "Research & materials", exact: true })).toBeVisible();
    await expect(page.getByText("Coauthor · Published in Example Journal", { exact: true })).toBeVisible();
    await expect(page.getByText("Tool · 2026", { exact: true })).toBeVisible();
    const reader = page.getByRole("region", { name: "Automation tools: Document reader", exact: true });
    await expect(reader.getByText("1 / 2", { exact: true })).toBeVisible();
    await expect(reader.getByRole("status")).toHaveCount(0);
    await expect(reader.getByText("Research paper first page", { exact: true })).toBeVisible();
    await expect(reader.getByRole("link", { name: "Open PDF", exact: true })).toHaveAttribute("href", "https://example.com/research-paper.pdf");
    await reader.getByRole("button", { name: "Next page" }).click();
    await expect(reader.getByRole("img", { name: "Automation tools · page 2", exact: true })).toBeVisible();
    await expect(reader.getByRole("status")).toHaveCount(0);
    await reader.getByRole("button", { name: "Zoom in" }).click();
    await expect(reader.getByText("125%", { exact: true })).toBeVisible();
    const paperStageHeight = await reader.locator("[data-document-stage]").evaluate(node => node.clientHeight);
    await page.getByRole("button", { name: "Slides", exact: true }).click();
    await expect(reader.getByRole("link", { name: "Open PDF", exact: true })).toHaveAttribute("href", "https://example.com/research-slides.pdf");
    await expect(reader.getByText("1 / 2", { exact: true })).toBeVisible();
    await expect(reader.getByRole("status")).toHaveCount(0);
    const slideStage = reader.locator("[data-document-stage]");
    expect(await slideStage.evaluate(node => node.clientHeight)).toBeLessThan(paperStageHeight);
    await expect.poll(() => slideStage.evaluate(node => node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth + 1)).toBeTruthy();
    await page.setViewportSize({ width: 1440, height: 600 });
    await expect.poll(() => slideStage.evaluate(node => node.clientHeight)).toBeLessThan(335);
    const shortSlideHeight = await slideStage.evaluate(node => node.clientHeight);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect.poll(() => slideStage.evaluate(node => node.clientHeight)).toBeGreaterThan(shortSlideHeight + 100);
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(reader.getByRole("status")).toHaveCount(0);
    await expect.poll(() => slideStage.evaluate(node => node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth + 1)).toBeTruthy();
    expect(await slideStage.evaluate(node => Math.abs(node.clientHeight - (node.querySelector("canvas")?.getBoundingClientRect().height ?? 0) - 24))).toBeLessThan(2);
    expect(await reader.evaluate(node => node.getBoundingClientRect().right <= window.innerWidth)).toBeTruthy();
    await page.screenshot({ path: ".artifacts/playwright/work-research-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const repositoryStack = page.getByRole("complementary", { name: "Automation tools technologies grouped by category" });
    await expect(repositoryStack.locator('summary[aria-label="Python · Language"]')).toBeVisible();
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
    await expect(page.locator("#career-story")).toHaveAttribute("aria-label", "About");
    await expect(page.getByRole("heading", { level: 1, name: "main" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Massimo Stefan standing in an elevator, holding a laptop" })).toBeVisible();
    const story = page.locator("#career-story");
    const aboutCareer = page.getByRole("region", { name: "Career", exact: true });
    await expect(aboutCareer.locator("[data-career-main-row]")).toHaveAttribute("aria-pressed", "true");
    const storyBox = await story.boundingBox();
    const careerBox = await aboutCareer.boundingBox();
    expect(storyBox && careerBox && careerBox.y + careerBox.height <= storyBox.y).toBeTruthy();
    await aboutCareer.locator("button[data-career-job]", { hasText: "Amazon" }).click();
    await expect(aboutCareer.locator("button[data-career-job]", { hasText: "Amazon" })).toHaveAttribute("aria-pressed", "true");
    await expect(story.getByRole("heading", { level: 1, name: "main" })).toBeVisible();
    await expect(aboutCareer.locator("[aria-live='polite']")).toHaveCount(0);
    await aboutCareer.locator("[data-career-main-row]").click();
    await expect(story.getByRole("heading", { level: 1, name: "main" })).toBeVisible();
    await expect(story.getByRole("img", { name: "Massimo Stefan standing in an elevator, holding a laptop" })).toBeVisible();
    await showReviewStep(page, "3 · About and portrait");

    // 4. Toggle dark mode and verify the rendered theme state.
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await showReviewStep(page, "4 · Dark theme");

    // 5. Switch to Italian and verify localized navigation and content.
    await page.getByRole("button", { name: "Select language" }).click();
    await page.getByRole("menuitemradio", { name: /Italiano/ }).click();
    await expect(page).toHaveURL(/\/it\/about$/);
    await expect(page.locator("#career-story")).toHaveAttribute("aria-label", "Profilo");
    await expect(page.getByRole("heading", { level: 1, name: "main" })).toBeVisible();
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
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.goto("/en/about");
    const mobileStory = page.locator("#career-story");
    const mobileExplorer = page.getByRole("region", { name: "Career", exact: true });
    const mobileStoryBox = await mobileStory.boundingBox();
    const mobileExplorerBox = await mobileExplorer.boundingBox();
    expect(mobileStoryBox && mobileExplorerBox && mobileExplorerBox.y + mobileExplorerBox.height <= mobileStoryBox.y).toBeTruthy();
    await mobileExplorer.locator("button[data-career-job]", { hasText: "Amazon" }).click();
    await expect(mobileStory.getByRole("heading", { level: 1, name: "main" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Read story/ })).toHaveCount(0);
    await page.screenshot({ path: ".artifacts/playwright/career-about-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 400, height: 800 });
    await expect(page.locator("footer > div")).toHaveCSS("flex-direction", "row");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.goto("/it");
    await expect(page.getByRole("region", { name: "Percorso", exact: true })).toBeVisible();
    await expect(page.locator("footer > div")).toHaveCSS("flex-direction", "row");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
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
      await expect(frame.locator("iframe")).not.toHaveAttribute("sandbox");
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
    const stack = page.getByRole("complementary", { name: "Tecnologie di mstefan.dev raggruppate per categoria" });
    for (const width of [900, 640, 576, 360]) {
      await page.setViewportSize({ width, height: 800 });
      const details = await page.locator("#selected-work-title").boundingBox();
      const panel = await stack.boundingBox();
      expect(await stack.locator("[data-work-stack-scroll]").evaluate(node => node.clientHeight)).toBe(158);
      expect(details && panel && panel.x >= details.x + details.width && Math.abs(panel.y - details.y) < 2).toBeTruthy();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 900) await page.screenshot({ path: ".artifacts/playwright/work-stack-medium.png", fullPage: true });
    }
    await page.setViewportSize({ width: 360, height: 800 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: ".artifacts/playwright/gallery-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 900, height: 800 });
    await writeFile(state, "dense");
    await page.reload();
    const scroller = stack.locator("[data-work-stack-scroll]");
    await expect.poll(() => scroller.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
    const visibleFifthRow = await stack.locator("summary").nth(8).evaluate(node => {
      const viewport = node.closest("[data-work-stack-scroll]")!.getBoundingClientRect();
      const icon = node.getBoundingClientRect();
      return Math.max(0, Math.min(icon.bottom, viewport.bottom) - Math.max(icon.top, viewport.top));
    });
    expect(visibleFifthRow).toBeCloseTo(14, 0);
    await scroller.evaluate(node => { node.scrollTop = node.scrollHeight; });
    const lastIcon = stack.locator("summary").last();
    await lastIcon.focus();
    await expect(lastIcon).toBeVisible();
    const lastName = (await lastIcon.getAttribute("aria-label"))!.split(" · ")[0];
    await expect(page.getByText(lastName, { exact: true }).last()).toBeVisible();
    await expect.poll(() => scroller.evaluate(node => node.scrollTop > 0)).toBe(true);
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
