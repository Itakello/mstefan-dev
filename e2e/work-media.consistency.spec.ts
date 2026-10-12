import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { installOfflineReview } from "./offline-review";

test.beforeEach(async ({ context }) => {
  await installOfflineReview(context);
  await writeFile(process.env.VISUAL_NOTION_FIXTURE_STATE!, "media");
});

for (const size of ["desktop", "mobile"] as const) {
  test.describe(size, () => {
    test.use({ hasTouch: size === "mobile", isMobile: size === "mobile", viewport: size === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
    for (const theme of ["light", "dark"] as const) {
      test(`${theme}: integrated Work media inline and expanded`, async ({ page }, testInfo) => {
        test.setTimeout(120_000);
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await page.addInitScript(value => localStorage.setItem("theme", value), theme);
        await page.goto("/en/projects?project=PhysIQ");
        await expect(page.getByRole("heading", { name: "PhysIQ", exact: true })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const media = page.locator("[data-media-preview]");
        const enlarge = media.getByRole("button", { name: "Enlarge preview" });
        const close = media.getByRole("button", { name: "Close preview" });
        for (const kind of ["Photos", "Paper", "Slides"] as const) {
          const control = page.getByRole("button", { name: kind, exact: true });
          if (size === "mobile") {
            await control.evaluate(node => node.addEventListener("touchstart", event => node.setAttribute("data-review-touch-points", String((event as TouchEvent).touches.length)), { once: true }));
            await control.tap();
            await expect(control).toHaveAttribute("data-review-touch-points", "1");
          }
          else { await page.keyboard.press("Tab"); await control.focus(); await control.press("Enter"); }
          await expect(control).toHaveAttribute("aria-pressed", "true");
          if (kind === "Photos") {
            const image = media.getByRole("img", { name: "PhysIQ: Puzzles", exact: true });
            await expect(image).toBeVisible();
            await expect(image).toHaveAttribute("src", "/work-previews/physiq-puzzles.png");
            await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
            await expect(media.getByRole("group", { name: "Preview page" })).toContainText("Puzzles · 1 / 2");
            const next = media.getByRole("button", { name: "Next preview", exact: true });
            const previous = media.getByRole("button", { name: "Previous preview", exact: true });
            await expect(next).toBeEnabled();
            await expect(previous).toBeEnabled();
            if (size === "mobile") {
              await next.tap();
              await expect(media.getByRole("group", { name: "Preview page" })).toContainText("Results · 2 / 2");
              await expect(media.getByRole("img", { name: "PhysIQ: Results", exact: true })).toHaveAttribute("src", "/work-previews/physiq-results.png");
              await previous.tap();
              await expect(media.getByRole("group", { name: "Preview page" })).toContainText("Puzzles · 1 / 2");
              await expect(image).toBeVisible();
            }
          } else if (kind === "Paper") {
            await expect(media.locator("[data-document-text]")).toContainText("Research");
            await expect(media.getByRole("status")).toHaveCount(0);
            await expect(media.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", "https://arxiv.org/pdf/2410.07109");
          } else {
            await expect(media.locator("iframe")).toHaveAttribute("src", "/presentations/physiq/index.html");
            await expect(media.locator(".media-caption")).toContainText("1 / 25");
            await expect(page.frameLocator("[data-powerpoint-preview] iframe").locator("#stage canvas").first()).toBeVisible();
            await expect(page.frameLocator("[data-powerpoint-preview] iframe").locator("#waitingIndicator")).toBeHidden();
            await expect(media.getByRole("link", { name: "Download PowerPoint" })).toHaveAttribute("href", "https://example.com/physiq.pptx");
          }
          await expect(enlarge).toBeVisible();
          if (size === "desktop") {
            await enlarge.focus();
            expect(await enlarge.evaluate(node => node.matches(":focus-visible"))).toBe(true);
            await expect(enlarge).toHaveCSS("outline-width", "2px");
          } else {
            await media.locator("..").scrollIntoViewIfNeeded();
            expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
            await expect(enlarge).toHaveCSS("opacity", "1");
            await expect(enlarge).toBeInViewport();
            for (const visibleControl of await media.locator("[data-preview-arrow]:not(:disabled), [data-media-download], [data-media-zoom]").all()) await expect(visibleControl).toHaveCSS("opacity", "1");
            const bounds = await enlarge.boundingBox();
            expect(bounds!.width).toBeGreaterThanOrEqual(32);
            expect(bounds!.height).toBeGreaterThanOrEqual(32);
          }
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
          await page.screenshot({ path: testInfo.outputPath(`work-integrated-${kind.toLowerCase()}-inline-${size}-${theme}.png`), fullPage: size === "desktop", animations: "disabled" });
          if (size === "mobile") await enlarge.tap();
          else await enlarge.press("Enter");
          await expect.poll(() => media.evaluate(node => node.matches(":modal"))).toBe(true);
          await expect(close).toBeFocused();
          if (size === "desktop") {
            expect(await close.evaluate(node => node.matches(":focus-visible"))).toBe(true);
            await expect(close).toHaveCSS("outline-width", "2px");
          }
          if (kind === "Paper") await expect(media.getByRole("status")).toHaveCount(0);
          if (kind === "Slides") await expect.poll(() => page.frameLocator("[data-powerpoint-preview] iframe").locator("#stage").evaluate(node => Math.abs(node.getBoundingClientRect().width - window.innerWidth))).toBeLessThan(2);
          if (kind !== "Photos" || size === "mobile") await page.screenshot({ path: testInfo.outputPath(`work-integrated-${kind.toLowerCase()}-expanded-${size}-${theme}.png`), animations: "disabled" });
          if (size === "mobile") await close.tap();
          else {
            if (kind === "Slides") await page.frameLocator("[data-powerpoint-preview] iframe").locator("#stage").click();
            await page.keyboard.press("Escape");
          }
          await expect.poll(() => media.evaluate(node => node.matches(":modal"))).toBe(false);
          await expect(enlarge).toBeFocused();
        }
      });
    }
  });
}

test("forced colors: integrated document controls and expanded close", async ({ page }, testInfo) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/en/projects?project=PhysIQ");
  const paper = page.getByRole("button", { name: "Paper", exact: true });
  await page.keyboard.press("Tab");
  await paper.focus();
  await paper.press("Enter");
  const media = page.locator("[data-media-preview]");
  await expect(media.locator("[data-document-text]")).toContainText("Research");
  const zoom = media.getByRole("button", { name: "Zoom in" });
  await zoom.focus();
  await expect(paper).toHaveCSS("outline-style", "solid");
  await expect(paper).toHaveCSS("outline-width", "2px");
  await expect(paper).not.toBeFocused();
  expect(await zoom.evaluate(node => node.matches(":focus-visible"))).toBe(true);
  await expect(zoom).toHaveCSS("outline-style", "solid");
  await expect(zoom).toHaveCSS("outline-width", "2px");
  await zoom.press("Enter");
  await expect(media.getByRole("group", { name: "Document zoom" })).toContainText("125%");
  await expect(media.getByRole("status")).toHaveCount(0);
  for (const name of ["Zoom out", "Enlarge preview"]) await expect(media.getByRole("button", { name })).toBeVisible();
  await expect(media.getByRole("link", { name: "Download PDF" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("work-integrated-paper-focus-forced-colors.png"), fullPage: true, animations: "disabled" });
  const enlarge = media.getByRole("button", { name: "Enlarge preview" });
  await enlarge.focus();
  await enlarge.press("Enter");
  await expect.poll(() => media.evaluate(node => node.matches(":modal"))).toBe(true);
  const close = media.getByRole("button", { name: "Close preview" });
  await expect(close).toBeFocused();
  expect(await close.evaluate(node => node.matches(":focus-visible"))).toBe(true);
  await expect(close).toHaveCSS("outline-style", "solid");
  await expect(close).toHaveCSS("outline-width", "2px");
  await expect(media.getByRole("status")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("work-integrated-paper-expanded-forced-colors.png"), animations: "disabled" });
  await close.press("Enter");
  await expect.poll(() => media.evaluate(node => node.matches(":modal"))).toBe(false);
  await expect(enlarge).toBeFocused();
});
