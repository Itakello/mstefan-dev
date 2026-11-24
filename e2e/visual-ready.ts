import { expect, type Locator, type Page } from "@playwright/test";

// Keep ongoing career markers stable across captures without pausing browser timers.
export async function fixVisualDate(page: Page) {
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00Z"));
}

export async function expectDrawnIcons(icons: Locator) {
  await expect.poll(() => icons.count()).toBeGreaterThan(0);
  for (const icon of await icons.all()) {
    await expect(icon).toBeVisible();
    await expect.poll(() => icon.evaluate(node => {
      const box = (node as SVGGraphicsElement).getBBox();
      return box.width > 0 && box.height > 0 && node.querySelectorAll("path, circle, rect, polygon, polyline, line, ellipse, use").length > 0;
    })).toBe(true);
  }
}

export async function stablePage(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(image => image.decode().catch(() => {})));
  });
  await expect(page.locator("footer a svg")).toHaveCount(4);
  await expectDrawnIcons(page.locator("footer a svg"));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}
