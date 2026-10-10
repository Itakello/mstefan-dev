// spec: specs/mstefan-site-review.md
// seed: e2e/seed.ts

import { writeFile } from "node:fs/promises";
import { installOfflineReview } from "./offline-review";

import { expect, showReviewStep, test } from "./seed";

test.describe("Public website review", () => {
  test.beforeEach(async ({ context }) => {
    await installOfflineReview(context);
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
    await expect(page.getByRole("region", { name: "Career", exact: true })).toHaveCount(0);
    await showReviewStep(page, "1 · English home and selected work");

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
    await expect(page.locator("[data-work-stack-label]")).toContainText("TypeScript");
    await typeScript.evaluate(node => window.scrollBy(0, node.getBoundingClientRect().bottom + 1));
    await expect(page.locator("[data-work-stack-label]")).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(projectStack.getByText("Python", { exact: true })).toHaveCount(0);
    const desktop = page.getByRole("img", { name: "Desktop: Screenshot of mstefan.dev", exact: true });
    const mobile = page.getByRole("img", { name: "Mobile: Screenshot of mstefan.dev", exact: true });
    const modes = page.getByRole("group", { name: "Preview size" });
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(desktop).toBeVisible();
    await expect.poll(() => desktop.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(1280);
    await expect(modes.getByRole("button", { name: "Desktop", exact: true })).toHaveAttribute("aria-pressed", "true");
    const modeBox = await modes.boundingBox();
    const stackBox = await projectStack.boundingBox();
    const header = await page.getByRole("link", { name: "Visit website", exact: true }).boundingBox();
    const preview = await desktop.boundingBox();
    expect(header && preview && header.y + header.height < preview.y).toBeTruthy();
    expect(modeBox && preview && stackBox && modeBox.y >= preview.y + preview.height && Math.abs(modeBox.x + modeBox.width - stackBox.x - stackBox.width) < 2).toBeTruthy();
    await page.locator("#playwright-review-step").evaluate(node => node.remove());
    await page.screenshot({ path: ".artifacts/playwright/work-desktop.png", fullPage: true });
    await modes.getByRole("button", { name: "Mobile", exact: true }).click();
    await expect(mobile).toBeVisible();
    await expect.poll(() => mobile.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(390);
    const mobileBox = await mobile.boundingBox();
    expect(mobileBox!.width / mobileBox!.height).toBeCloseTo(390 / 844, 2);
    expect(mobileBox!.width).toBeLessThanOrEqual(390);
    for (const width of [1280, 900, 640, 360]) {
      await page.setViewportSize({ width, height: 800 });
      await modes.getByRole("button", { name: "Desktop", exact: true }).click();
      const desktopHeight = (await desktop.boundingBox())!.height;
      await modes.getByRole("button", { name: "Mobile", exact: true }).click();
      const phone = (await mobile.boundingBox())!;
      expect(phone.height).toBeCloseTo(desktopHeight, 0);
      expect((phone.width - 2) / (phone.height - 2)).toBeCloseTo(390 / 844, 2);
    }
    await expect(modes.getByRole("button", { name: "Mobile", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("iframe")).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ path: ".artifacts/playwright/work-phone.png", fullPage: true });
    await modes.getByRole("button", { name: "Desktop", exact: true }).click();
    await expect(desktop).toBeVisible();
    const clientSelection = page.getByRole("navigation", { name: "Choose a project" }).getByRole("button", { name: "Select The Karakal Times" });
    await clientSelection.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByRole("img", { name: "Desktop: Screenshot of The Karakal Times", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/en\/projects$/);
    await expect(page.getByRole("link", { name: "Visit website", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Source code", exact: true })).toHaveCount(0);
    await page.goto("/en/projects?project=LLM%20Interaction%20Simulator");
    await expect(page.getByRole("region", { name: "Research & materials", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Co-author · I Want to Break Free! (TMLR, 2025)", exact: true })).toHaveAttribute("href", "https://arxiv.org/pdf/2410.07109");
    await expect(page.getByRole("link", { name: "Source code", exact: true })).toHaveAttribute("href", "https://github.com/mobs-fbk/llm_interaction_simulator");
    await expect(page.getByRole("heading", { name: "Accomplishments", exact: true })).toHaveCount(0);
    for (const width of [1280, 360]) {
      await page.setViewportSize({ width, height: 800 });
      const accomplishment = (await page.getByText("Co-author · I Want to Break Free! (TMLR, 2025)", { exact: true }).locator("..").boundingBox())!;
      const links = (await page.getByRole("link", { name: "Source code", exact: true }).boundingBox())!;
      expect(accomplishment.height).toBeLessThanOrEqual(24);
      expect(accomplishment.y + accomplishment.height).toBeLessThan(links.y);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.getByText("Research · 2024", { exact: true })).toBeVisible();
    const reader = page.getByRole("region", { name: "LLM Interaction Simulator: Document reader", exact: true });
    await expect(reader.getByText("1 / 2", { exact: true })).toBeVisible();
    await expect(reader.getByRole("status")).toHaveCount(0);
    await expect(reader.getByText("Research paper first page", { exact: true })).toBeVisible();
    const researchModes = page.getByRole("group", { name: "Research & materials", exact: true });
    for (const width of [1280, 360]) {
      await page.setViewportSize({ width, height: 800 });
      for (const mode of ["Paper", "Slides"]) {
        await researchModes.getByRole("button", { name: mode, exact: true }).click();
        await expect(reader.getByRole("status")).toHaveCount(0);
        const mediaBox = (await reader.boundingBox())!;
        const toggleBox = (await researchModes.boundingBox())!;
        expect(toggleBox.y).toBeGreaterThanOrEqual(mediaBox.y + mediaBox.height);
        expect(Math.abs(toggleBox.x + toggleBox.width - mediaBox.x - mediaBox.width)).toBeLessThan(2);
      }
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await researchModes.getByRole("button", { name: "Paper", exact: true }).click();
    await expect(reader.getByRole("status")).toHaveCount(0);
    await expect(reader.getByRole("link", { name: "Open PDF", exact: true })).toHaveAttribute("href", "https://arxiv.org/pdf/2410.07109");
    await reader.getByRole("button", { name: "Next page" }).click();
    await expect(reader.getByRole("img", { name: "LLM Interaction Simulator · page 2", exact: true })).toBeVisible();
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
    const repositoryStack = page.getByRole("complementary", { name: "LLM Interaction Simulator technologies grouped by category" });
    await expect(repositoryStack.locator('summary[aria-label="Python · Language"]')).toBeVisible();
    await expect(repositoryStack.getByText("TypeScript", { exact: true })).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Preview size" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Source code", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Visit website", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Select mstefan.dev", exact: true }).click();
    await expect(desktop).toBeVisible();
    await showReviewStep(page, "2 · Work explorer and responsive preview toggle");

    // 3. Open About and verify its portrait and biography.
    await page.getByRole("link", { name: "About", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/about$/);
    await expect(page.locator("#career-story")).toHaveAttribute("aria-label", "About");
    await expect(page.getByRole("heading", { level: 1, name: "master" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Massimo Stefan standing in an elevator, holding a laptop" })).toBeVisible();
    const story = page.locator("#career-story");
    const aboutCareer = page.getByRole("region", { name: "Career", exact: true });
    await expect(story.locator("h1 svg[aria-hidden=\"true\"]")).toHaveCount(1);
    await page.screenshot({ path: ".artifacts/playwright/career-about-desktop.png", fullPage: true });
    await expect(aboutCareer.locator("[data-career-main-row]")).toHaveAttribute("aria-pressed", "true");
    const storyBox = await story.boundingBox();
    const careerBox = await aboutCareer.boundingBox();
    expect(storyBox && careerBox && storyBox.x + storyBox.width <= careerBox.x).toBeTruthy();
    expect(storyBox && careerBox && Math.abs(storyBox.y - careerBox.y) < 1).toBeTruthy();
    await aboutCareer.locator("button[data-career-job]", { hasText: "Amazon" }).click();
    await expect(aboutCareer.locator("button[data-career-job]", { hasText: "Amazon" })).toHaveAttribute("aria-pressed", "true");
    await expect(story.getByRole("heading", { level: 1, name: "master" })).toBeVisible();
    await expect(aboutCareer.locator("[aria-live='polite']")).toHaveCount(0);
    await aboutCareer.locator("[data-career-main-row]").click();
    await expect(story.getByRole("heading", { level: 1, name: "master" })).toBeVisible();
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
    await expect(page.getByRole("heading", { level: 1, name: "master" })).toBeVisible();
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
    await expect(page.getByRole("region", { name: "Career", exact: true })).toHaveCount(0);
    await page.goto("/en/about");
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
    await page.screenshot({ path: ".artifacts/playwright/career-about-keyboard-mobile.png", fullPage: true });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.goto("/en/about");
    const mobileStory = page.locator("#career-story");
    const mobileExplorer = page.getByRole("region", { name: "Career", exact: true });
    const mobileStoryBox = await mobileStory.boundingBox();
    const mobileExplorerBox = await mobileExplorer.boundingBox();
    expect(mobileStoryBox && mobileExplorerBox && mobileExplorerBox.y + mobileExplorerBox.height <= mobileStoryBox.y).toBeTruthy();
    await mobileExplorer.locator("button[data-career-job]", { hasText: "Amazon" }).click();
    await expect(mobileStory.getByRole("heading", { level: 1, name: "master" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Read story/ })).toHaveCount(0);
    await page.screenshot({ path: ".artifacts/playwright/career-about-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 400, height: 800 });
    await expect(page.locator("footer > div")).toHaveCSS("flex-direction", "row");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.goto("/it");
    await expect(page.getByRole("region", { name: "Percorso", exact: true })).toHaveCount(0);
    await page.goto("/it/about");
    await expect(page.getByRole("region", { name: "Percorso", exact: true })).toBeVisible();
    await expect(page.locator("footer > div")).toHaveCSS("flex-direction", "row");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(browserErrors, browserErrors.join("\n")).toEqual([]);
  });

  test("Missing screenshots retain the external visit link and recover on switching", async ({ page }) => {
    await page.route("**/website-previews/**/en-desktop.png", route => route.fulfill({ status: 404, body: "" }));
    await page.goto("/en/websites");
    await expect(page).toHaveURL(/\/en\/projects$/);
    await page.getByRole("button", { name: "Select mstefan.dev", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Screenshot unavailable. You can still visit the website.");
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Visit website", exact: true })).toHaveAttribute("href", "https://www.mstefan.dev/en");
    await page.getByRole("group", { name: "Preview size" }).getByRole("button", { name: "Mobile", exact: true }).click();
    const image = page.getByRole("img", { name: "Mobile: Screenshot of mstefan.dev", exact: true });
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(390);
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("Screenshot failures before hydration show the unavailable message", async ({ page }) => {
    await writeFile(process.env.VISUAL_NOTION_FIXTURE_STATE!, "one");
    const scripts: import("@playwright/test").Route[] = [];
    const deferScript = (route: import("@playwright/test").Route) => { scripts.push(route); };
    await page.route("**/*.js", deferScript);
    await page.route("**/website-previews/**", route => route.fulfill({ status: 404, body: "" }));
    await page.goto("/en/projects", { waitUntil: "commit" });
    const image = page.getByRole("img", { name: "Desktop: Screenshot of mstefan.dev", exact: true });
    await expect.poll(() => image.evaluate(node => {
      const image = node as HTMLImageElement;
      return image.complete && image.naturalWidth === 0;
    })).toBe(true);
    await page.unroute("**/*.js", deferScript);
    await Promise.all(scripts.map(route => route.continue()));
    await expect(page.getByRole("status")).toHaveText("Screenshot unavailable. You can still visit the website.");
    await expect(page.getByRole("link", { name: "Visit website", exact: true })).toBeVisible();
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
      expect((await stack.locator("[data-work-stack-scroll]").boundingBox())?.height).toBeCloseTo(158, 0);
      const section = await page.locator("section[aria-labelledby=selected-work-title]").boundingBox();
      expect(panel && section && Math.abs(panel.x + panel.width - section.x - section.width) < 2).toBeTruthy();
      await expect(stack.getByRole("heading", { name: "Stack", exact: true })).toHaveCSS("text-align", "right");
      expect(details && panel && (width >= 640 ? panel.x >= details.x + details.width && Math.abs(panel.y - details.y) < 2 : panel.y > details.y + details.height)).toBeTruthy();
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
    const columns = scroller.locator(":scope > ul > li");
    await expect(columns.first()).toHaveAttribute("aria-label", "Linguaggio");
    await expect(columns.filter({ has: page.locator('summary[aria-label="Infrastruttura"]') })).toHaveCount(1);
    await expect(columns.last()).toHaveAttribute("aria-label", "Integrazione");
    await expect(columns.last().locator(":scope > details > summary")).toHaveAttribute("aria-label", "Integrazione");
    const language = columns.first().locator(":scope > details > summary");
    await language.hover();
    await expect(page.locator("[data-work-stack-label]")).toHaveText("Linguaggio");
    await language.focus();
    await expect(page.locator("[data-work-stack-label]")).toHaveText("Linguaggio");
    await language.click();
    await expect(columns.first().locator(":scope > details")).toHaveAttribute("open", "");
    await expect(page.locator("[data-work-stack-label]")).toHaveText("Linguaggio");
    const frameworkItems = columns.nth(1).locator(":scope > ul summary");
    await frameworkItems.first().click();
    await frameworkItems.nth(1).click();
    await expect(page.locator("[data-work-stack-label]")).toContainText("Tailwind CSS");
    const separatedName = stack.locator('summary[aria-label="React · DOM · Libreria"]');
    await separatedName.focus();
    await page.evaluate(() => window.scrollBy(0, 10));
    await expect(page.locator("[data-work-stack-label]")).toContainText("React · DOM");
    await expect(page.locator("[data-work-stack-label]")).toContainText("Libreria");
    await page.evaluate(() => window.scrollTo(0, 0));
    await language.focus();
    const languageItems = columns.first().locator(":scope > ul summary");
    await expect(languageItems).toHaveCount(1);
    const headerBox = await language.boundingBox();
    const itemBox = await languageItems.first().boundingBox();
    expect(headerBox && itemBox && itemBox.y > headerBox.y && Math.abs(itemBox.x - headerBox.x) < 1).toBeTruthy();
    await page.setViewportSize({ width: 640, height: 800 });
    await expect.poll(() => scroller.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
    const lastIcon = stack.locator("summary").last();
    await lastIcon.focus();
    await expect(lastIcon).toBeVisible();
    const lastName = (await lastIcon.getAttribute("aria-label"))!.split(" · ")[0];
    await expect(page.locator("[data-work-stack-label]")).toContainText(lastName);
    await expect.poll(() => scroller.evaluate(node => node.scrollLeft > 0)).toBe(true);
    await scroller.evaluate(node => { node.scrollLeft = 0; });
    await expect(page.locator("[data-work-stack-label]")).toHaveCount(0);
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
