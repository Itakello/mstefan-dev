import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { installOfflineReview } from "./offline-review";

async function expectDrawnIcons(icons: Locator) {
  await expect.poll(() => icons.count()).toBeGreaterThan(0);
  for (const icon of await icons.all()) {
    await expect(icon).toBeVisible();
    await expect.poll(() => icon.evaluate(node => {
      const box = (node as SVGGraphicsElement).getBBox();
      return box.width > 0 && box.height > 0 && node.querySelectorAll("path, circle, rect, polygon, polyline, line, ellipse, use").length > 0;
    })).toBe(true);
  }
}

async function stablePage(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(image => image.decode().catch(() => {})));
  });
  await expectDrawnIcons(page.locator("footer [data-brand-icon]"));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function expectTransparentBadges(page: Page) {
  const badges = page.locator(".stack-badge-icon:visible");
  await expect.poll(() => badges.count()).toBeGreaterThan(0);
  for (const badge of await badges.all()) {
    await expectDrawnIcons(badge.locator("svg"));
    await expect(badge).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(badge).toHaveCSS("border-top-width", "0px");
  }
}

async function scrollStyle(scroller: Locator) {
  return scroller.evaluate(node => {
    const style = getComputedStyle(node);
    const thumb = getComputedStyle(node, "::-webkit-scrollbar-thumb");
    const track = getComputedStyle(node, "::-webkit-scrollbar-track");
    return { color: style.scrollbarColor, width: style.scrollbarWidth, thumb: thumb.backgroundColor, radius: thumb.borderRadius, track: track.backgroundColor };
  });
}

async function compareScreenshot(target: Page | Locator, name: string, testInfo: TestInfo, options: NonNullable<Parameters<Page["screenshot"]>[0]>, maxDiffPixels: number) {
  await target.screenshot({ ...options, path: testInfo.outputPath(name) });
  await expect.soft(target).toHaveScreenshot(name, { ...options, maxDiffPixels });
}

const modes = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

test.beforeEach(async ({ context }) => installOfflineReview(context));

for (const mode of modes) {
  for (const theme of ["light", "dark"] as const) {
    test(`${mode.name} ${theme}: Home, Work, About and footer remain consistent`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: mode.width, height: mode.height });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(value => localStorage.setItem("theme", value), theme);
      await page.goto("/en/projects?project=LLM%20Interaction%20Simulator");
      await expect(page.getByRole("heading", { name: "My work", exact: true })).toBeVisible();
      if (theme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      else await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
      const workGitHub = page.getByRole("link", { name: "Source code", exact: true }).locator('[data-brand-icon="github"]');
      await expectDrawnIcons(workGitHub);
      const githubShape = await workGitHub.innerHTML();
      await expect(page.locator('footer [data-brand-icon="github"]')).toHaveJSProperty("innerHTML", githubShape);
      await page.getByRole("button", { name: "Select mstefan.dev", exact: true }).click();
      await expectTransparentBadges(page);
      const workScroll = await scrollStyle(page.locator("[data-work-stack-scroll]"));
      await stablePage(page);
      await compareScreenshot(page, `work-${mode.name}-${theme}.png`, testInfo, {
        fullPage: true, animations: "disabled",
        mask: [page.getByRole("img", { name: "Desktop: Screenshot of mstefan.dev", exact: true }), page.locator("footer p")],
      }, 100);
      await page.goto("/en/about");
      await expect(page.getByRole("heading", { level: 1, name: "master" })).toBeVisible();
      await stablePage(page);
      const careerScroll = page.getByRole("region", { name: /^Graph\./ });
      expect(await scrollStyle(careerScroll)).toEqual(workScroll);
      await compareScreenshot(page, `about-${mode.name}-${theme}.png`, testInfo, {
        fullPage: true, animations: "disabled", mask: [page.locator("footer p")],
      }, 100);
      const footer = page.locator("footer");
      await footer.scrollIntoViewIfNeeded();
      await compareScreenshot(footer, `footer-${mode.name}-${theme}.png`, testInfo, {
        animations: "disabled", mask: [footer.locator("p")],
      }, 20);
      for (const brand of ["github", "linkedin", "x"]) {
        const icon = footer.locator(`[data-brand-icon="${brand}"]`);
        await expectDrawnIcons(icon);
        const link = icon.locator("..");
        await expect(link).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      }
      await writeFile(process.env.VISUAL_NOTION_FIXTURE_STATE!, "publication");
      await page.goto("/en");
      const cardGitHub = page.locator('main [data-brand-icon="github"]');
      await expectDrawnIcons(cardGitHub);
      for (const icon of await cardGitHub.all()) await expect(icon).toHaveJSProperty("innerHTML", githubShape);
      await expectTransparentBadges(page);
      await stablePage(page);
      if (mode.name === "mobile") {
        const scrollRight = page.getByRole("button", { name: "Scroll technologies right", exact: true });
        await expect(scrollRight).toHaveCSS("opacity", "1");
        await expectDrawnIcons(scrollRight.locator("svg"));
      }
      await compareScreenshot(page, `home-${mode.name}-${theme}.png`, testInfo, {
        fullPage: true, animations: "disabled", mask: [page.locator("footer p")],
      }, 100);
    });
  }
}
