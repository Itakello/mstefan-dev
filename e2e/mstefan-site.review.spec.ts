// spec: specs/mstefan-site-review.md
// seed: e2e/seed.ts

import { expect, showReviewStep, test } from "./seed";

test.describe("Public website review", () => {
  test("Review the primary bilingual visitor journey", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "light"));

    // 1. Open the English home page and verify the primary introduction.
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1, name: "I build AI systems for real work." })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Selected work" })).toBeVisible();
    await showReviewStep(page, "1 · English home and selected work");

    // 2. Open Projects and verify the public-projects surface.
    await page.getByRole("link", { name: "Projects", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/projects$/);
    await expect(page.getByRole("heading", { level: 1, name: "Public projects" })).toBeVisible();
    await showReviewStep(page, "2 · Public projects");

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
    await expect(page.getByRole("link", { name: "Progetti", exact: true })).toBeVisible();
    await showReviewStep(page, "5 · Italian localization");
  });
});
