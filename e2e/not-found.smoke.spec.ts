import { expect, test } from "@playwright/test";

const routes = [
  { path: "/old-page", locale: "en" },
  { path: "/en/old-page", locale: "en" },
  { path: "/it/old-page", locale: "it" },
  { path: "/old-page.html", locale: "en" },
  { path: "/fr/old-page", locale: "it" },
] as const;

test.beforeEach(async ({ context }) => {
  if (!process.env.VISUAL_NOTION_FIXTURE_STATE) throw new Error("The isolated production fixture is required");
  await context.setExtraHTTPHeaders({ "x-real-ip": "127.0.0.1" });
});

for (const width of [1280, 390]) {
  for (const { path, locale } of routes) {
    test(`@release-smoke ${width}px ${path} is a localized public 404`, async ({ page, context, baseURL }) => {
      await page.setViewportSize({ width, height: 800 });
      await context.addCookies([{ name: "site-locale", value: locale, url: baseURL! }]);
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "it" ? "Questa pagina non c’è." : "This page isn't here.");
      await expect(page.getByRole("link", { name: "Massimo Stefan", exact: false })).toHaveAttribute("href", `/${locale}`);
      if (width < 640) await page.getByRole("button", { name: locale === "it" ? "Apri navigazione" : "Open navigation" }).click();
      await expect(page.getByRole("link", { name: locale === "it" ? "Profilo" : "About", exact: true })).toHaveAttribute("href", `/${locale}/about`);
      await expect(page.getByRole("button", { name: locale === "it" ? "Cambia tema" : "Toggle theme" })).toBeVisible();
      await expect(page.getByRole("button", { name: locale === "it" ? "Seleziona lingua" : "Select language" })).toBeVisible();
    });
  }
}

for (const width of [1280, 390]) {
  test(`@release-smoke ${width}px language, theme, and About recovery work from a 404`, async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width, height: 800 });
    await context.addCookies([{ name: "site-locale", value: "en", url: baseURL! }]);
    await page.goto("/en/old-page");
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");
    await page.getByRole("button", { name: "Select language" }).click();
    await page.getByRole("menuitemradio", { name: "Italiano" }).click();
    await expect(page).toHaveURL(/\/it$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "it");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.goto("/it/old-page");
    if (width < 640) await page.getByRole("button", { name: "Apri navigazione" }).click();
    await page.getByRole("link", { name: "Profilo", exact: true }).click();
    await expect(page).toHaveURL(/\/it\/about$/);
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
}

test("@release-smoke public admin and API denials remain empty 404s", async ({ request, baseURL }) => {
  for (const path of ["/admin", "/api/users"]) {
    const response = await request.get(`${baseURL}${path}`, { headers: { "x-real-ip": "127.0.0.1" } });
    expect(response.status()).toBe(404);
    expect((await response.body()).length).toBe(0);
  }
});
