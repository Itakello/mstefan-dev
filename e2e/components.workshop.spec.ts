import { expect, test, type Page } from "@playwright/test";

async function story(page: Page, id: string, theme: string) {
  await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`);
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^$/);
  await page.evaluate(() => document.fonts.ready);
  for (const svg of await page.locator("main svg:visible").all()) {
    await expect.poll(() => svg.evaluate(node => {
      const box = (node as SVGGraphicsElement).getBBox();
      return box.width > 0 && box.height > 0;
    })).toBe(true);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

for (const theme of ["light", "dark"] as const) {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const size = viewport.width === 390 ? "mobile" : "desktop";
    test(`${size} ${theme} component states and interactions`, async ({ page, context, request }, testInfo) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      await page.clock.setFixedTime(new Date("2026-10-10T12:00:00Z"));
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      const external: string[] = [];
      const base = new URL(process.env.PLAYWRIGHT_BASE_URL!).origin;
      await context.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin === base) return route.continue();
        external.push(url.href);
        return route.abort();
      });
      const response = await request.get("/index.json");
      expect(response.ok()).toBe(true);
      const index = await response.json();
      const ids = Object.keys(index.entries).filter(id => index.entries[id].type === "story").sort();
      expect(ids.length).toBeGreaterThanOrEqual(11);
      for (const id of ids) {
        await story(page, id, theme);
        const name = `${id}-${size}-${theme}.png`;
        await page.locator("main").screenshot({ path: testInfo.outputPath(name), animations: "disabled" });
        await expect.soft(page.locator("main")).toHaveScreenshot(name, { animations: "disabled", maxDiffPixels: 40 });
        for (const badge of await page.locator(".stack-badge-icon:visible").all()) {
          await expect(badge).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
          await expect(badge.locator("svg")).toBeVisible();
        }
      }

      await story(page, "workshop-iconlink--contact-links", theme);
      const link = page.getByRole("link", { name: "GitHub", exact: true });
      const icon = link.locator("svg");
      await expect(icon).toHaveCSS("color", theme === "dark" ? "rgba(255, 255, 255, 0.65)" : "rgba(0, 0, 0, 0.65)");
      await expect(link).toHaveAttribute("href", "https://github.com/example");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      await link.hover();
      await expect(icon).toHaveCSS("color", theme === "dark" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)");
      await page.mouse.move(0, 0);
      await page.keyboard.press("Tab");
      await link.focus();
      await expect(link).toBeFocused();
      await expect(icon).toHaveCSS("color", theme === "dark" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)");

      await story(page, "workshop-projectcard--collapsed", theme);
      const toggle = page.getByRole("button", { name: /Workshop task board details/i });
      await toggle.focus();
      await toggle.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await toggle.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");

      await story(page, "workshop-stack--categorized-catalog", theme);
      const overflow = page.locator(".stack-overflow-card");
      await overflow.focus();
      await overflow.press("Enter");
      await expect(overflow).toHaveAttribute("aria-expanded", "true");
      await overflow.press("Enter");
      await expect(overflow).toHaveAttribute("aria-expanded", "false");

      await story(page, "workshop-workexplorer--categories", theme);
      const categoryColors = new Set<string>();
      for (const [index, category] of ["Website", "App", "Tool", "Research"].entries()) {
        if (size === "mobile") await page.getByRole("combobox").selectOption(`category-${index}`);
        else await page.getByRole("button", { name: `Select ${category} project`, exact: true }).click();
        const badge = page.locator('section[aria-labelledby="selected-work-title"]').getByText(category, { exact: true });
        await expect(badge).toBeVisible();
        await expect(badge).toHaveCSS("border-top-width", "1px");
        const contrast = await badge.evaluate(node => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const context = canvas.getContext("2d")!;
          const ancestors: Element[] = [];
          for (let parent: Element | null = node; parent; parent = parent.parentElement) ancestors.unshift(parent);
          for (const ancestor of ancestors) {
            context.fillStyle = getComputedStyle(ancestor).backgroundColor;
            context.fillRect(0, 0, 1, 1);
          }
          const background = context.getImageData(0, 0, 1, 1).data;
          context.fillStyle = getComputedStyle(node).color;
          context.fillRect(0, 0, 1, 1);
          const foreground = context.getImageData(0, 0, 1, 1).data;
          const luminance = (color: Uint8ClampedArray) => [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
            const channel = color[index] / 255;
            return sum + weight * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
          }, 0);
          const values = [luminance(background), luminance(foreground)];
          return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
        });
        expect(contrast).toBeGreaterThanOrEqual(4.5);
        categoryColors.add(await badge.evaluate(node => getComputedStyle(node).color));
        if (size === "desktop") await expect(page.getByRole("button", { name: `Select ${category} project`, exact: true }).getByText(category, { exact: true })).toHaveCSS("color", await badge.evaluate(node => getComputedStyle(node).color));
      }
      expect(categoryColors.size).toBe(4);

      await story(page, "workshop-workexplorer--populated-selection", theme);
      if (size === "mobile") await page.getByRole("combobox").selectOption("workshop-data-notebook");
      else await page.getByRole("button", { name: /select.*Workshop data notebook/i }).click();
      await expect(page.getByRole("heading", { name: "Workshop data notebook" })).toBeVisible();
      if (size === "mobile") await page.getByRole("combobox").selectOption("workshop-task-board");
      else await page.getByRole("button", { name: /select.*Workshop task board/i }).click();
      await expect(page.getByRole("link", { name: /source/i })).toHaveAttribute("href", "https://github.com/example/workshop-task-board");

      const scroller = page.locator("[data-work-stack-scroll]");
      if (size === "desktop") {
        await expect.poll(() => scroller.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
        await scroller.focus();
        await scroller.press("End");
        await expect.poll(() => scroller.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
      } else {
        await expect.poll(() => scroller.evaluate(node => node.scrollHeight <= node.clientHeight)).toBe(true);
      }

      await story(page, "workshop-careergraph--expanded", theme);
      const job = page.getByRole("button", { name: /Sample Platform Team/ }).first();
      await job.focus();
      await job.press("Enter");
      await expect(page.getByText("Built a small internal planning tool", { exact: false })).toBeVisible();
      if (size === "desktop") {
        const graph = page.getByRole("region", { name: /^Graph/ });
        await graph.focus();
        await graph.press("Home");
        await expect(graph).toBeFocused();
      }
      expect(errors).toEqual([]);
      expect(external).toEqual([]);
    });
  }
}
