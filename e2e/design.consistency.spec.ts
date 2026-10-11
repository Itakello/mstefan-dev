import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
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

async function expectIconLinkColors(page: Page, icons: Locator, theme: "light" | "dark") {
  const neutral = theme === "light" ? "rgba(0, 0, 0, 0.65)" : "rgba(255, 255, 255, 0.65)";
  const active = theme === "light" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)";
  for (const icon of await icons.all()) {
    const link = icon.locator("xpath=ancestor::a");
    await expect(icon).toHaveCSS("color", neutral);
    expect(await icon.evaluate(node => {
      for (let parent: Element | null = node; parent; parent = parent.parentElement) {
        if (getComputedStyle(parent).opacity !== "1") return false;
        if (parent.tagName === "A") break;
      }
      return true;
    })).toBe(true);
    await link.hover();
    await expect(icon).toHaveCSS("color", active);
    await page.mouse.move(0, 0);
    await page.keyboard.press("Tab");
    await link.focus();
    await expect(link).toBeFocused();
    await expect(icon).toHaveCSS("color", active);
    await link.press("Tab");
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  }
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
  await target.screenshot({ ...options, mask: [], path: testInfo.outputPath(name) });
  await expect.soft(target).toHaveScreenshot(name, { ...options, maxDiffPixels });
}

const modes = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

test.beforeEach(async ({ context }) => installOfflineReview(context));

test("official Iconify API fallbacks return the same pinned artwork offline", async ({ page }) => {
  await page.goto("/en/about");
  const artwork = await page.evaluate(async () => Promise.all(
    ["api.iconify.design", "api.simplesvg.com", "api.unisvg.com"].map(async host => {
      const response = await fetch(`https://${host}/simple-icons.json?icons=github`);
      if (!response.ok) throw new Error(`Icon fixture failed: ${host}`);
      return response.json();
    }),
  ));
  expect(artwork[0].icons.github.body).toContain("<path");
  expect(artwork[1]).toEqual(artwork[0]);
  expect(artwork[2]).toEqual(artwork[0]);
});

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
      await expectIconLinkColors(page, workGitHub.locator("xpath=ancestor::div[1]").locator("a svg"), theme);
      const githubShape = await workGitHub.innerHTML();
      await expect(page.locator('footer [data-brand-icon="github"]')).toHaveJSProperty("innerHTML", githubShape);
      if (mode.name === "mobile") await page.getByRole("combobox", { name: "Choose a project" }).selectOption({ label: "mstefan.dev" });
      else await page.getByRole("button", { name: "Select mstefan.dev", exact: true }).click();
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
      if (mode.name === "desktop") {
        const careerScroll = page.getByRole("region", { name: /^Graph\./ });
        expect(await scrollStyle(careerScroll)).toEqual(workScroll);
      } else await expect(page.getByRole("region", { name: /^Graph\./, includeHidden: true })).toBeHidden();
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
      await expectIconLinkColors(page, footer.locator("svg"), theme);
      await writeFile(process.env.VISUAL_NOTION_FIXTURE_STATE!, "publication");
      await page.goto("/en");
      const cardGitHub = page.locator('main [data-brand-icon="github"]');
      await expectDrawnIcons(cardGitHub);
      for (const icon of await cardGitHub.all()) await expect(icon).toHaveJSProperty("innerHTML", githubShape);
      await expectIconLinkColors(page, cardGitHub, theme);
      await expectTransparentBadges(page);
      await stablePage(page);
      if (mode.name === "mobile") {
        const toolkit = page.getByRole("region", { name: "Toolkit", exact: true });
        await expect(toolkit.getByRole("button", { name: /Scroll technologies/ })).toHaveCount(0);
        await expect.poll(() => toolkit.locator(".stack-shelf").evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      }
      await compareScreenshot(page, `home-${mode.name}-${theme}.png`, testInfo, {
        fullPage: true, animations: "disabled", mask: [page.locator("footer p")],
      }, 100);
    });
  }
}

const careerFixturePassword = randomBytes(24).toString("base64url");
const completedCareerJobs = [
  { branchName: "work/amazon", company: "Amazon", role: "Software Development Engineer I", startDate: "2022-01-01", endDate: "2024-01-01", ongoing: false, summary: "Completed work experience for visual review.", color: "#c77835" },
  { branchName: "education/test-university", company: "Test University", role: "Qualification", startDate: "2014-01-01", endDate: "2023-01-01", ongoing: false, summary: "Completed education experience for visual review.", color: "#1267ab" },
];
let careerFixtureRegistered = false;

for (const theme of ["light", "dark"] as const) {
  test(`desktop ${theme}: completed Career endpoints, keyboard focus and selection`, async ({ page, request }, testInfo) => {
    const credentials = { email: "visual-career@example.invalid", password: careerFixturePassword };
    const authenticated = await request.post(careerFixtureRegistered ? "/api/users/login" : "/api/users/first-register", { data: credentials });
    expect(authenticated.status()).toBe(200);
    careerFixtureRegistered = true;
    const original = await request.get("/api/globals/career?locale=en&draft=false");
    expect(original.status()).toBe(200);
    const { jobs } = await original.json();
    const publish = (value: typeof completedCareerJobs) => request.post("/api/globals/career?locale=en&publishSpecificLocale=en", { data: { jobs: value, _status: "published" } });
    try {
      expect((await publish(completedCareerJobs)).status()).toBe(200);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(value => localStorage.setItem("theme", value), theme);
      await page.goto("/en/about");
      await stablePage(page);
      const career = page.getByRole("region", { name: "Career", exact: true });
      const row = career.locator("button[data-career-job]", { hasText: "work/amazon" });
      const branch = career.locator('[data-career-branch][aria-label^="work/amazon:"]');
      await expect(row).toContainText("Jan 2022 – Jan 2024");
      await expect(career.getByText("Dates not provided", { exact: true })).toHaveCount(0);
      await expect(branch.locator("[data-career-head]")).toHaveCSS("fill", "rgb(199, 120, 53)");
      const capture = (state: string) => career.screenshot({ path: testInfo.outputPath(`career-completed${state}-desktop-${theme}.png`), animations: "disabled" });
      await capture("");
      await page.keyboard.press("Tab");
      await branch.focus();
      await expect(branch).toBeFocused();
      expect(await branch.evaluate(node => node.matches(":focus-visible"))).toBe(true);
      await expect(row).toHaveAttribute("aria-pressed", "false");
      await capture("-focus");
      await branch.press("Enter");
      await expect(row).toHaveAttribute("aria-pressed", "true");
      await expect(row).toBeFocused();
      await expect(page.locator("#career-story h1")).toHaveText("Amazon");
      await capture("-selection");
    } finally {
      expect((await publish(jobs)).status()).toBe(200);
    }
  });
}
