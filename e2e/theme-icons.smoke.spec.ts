import { expect, test } from "@playwright/test";

for (const locale of ["en", "it"]) {
  for (const width of [1280, 390]) {
    test(`${locale} ${width}px menu, header and favicon follow the selected theme`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.setExtraHTTPHeaders({ "x-real-ip": "127.0.0.1" });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.addInitScript(() => {
        if (!localStorage.getItem("theme")) localStorage.setItem("theme", "light");
      });
      await page.goto(`/${locale}/icon-check`);
      const icon = page.locator("header img:visible");
      const favicon = page.locator('link[rel="icon"]');
      const open = page.getByRole("button", { name: locale === "it" ? "Apri navigazione" : "Open navigation", exact: true });
      const close = page.getByRole("button", { name: locale === "it" ? "Chiudi navigazione" : "Close navigation", exact: true });
      const toggle = page.getByRole("button", { name: locale === "it" ? "Cambia tema" : "Toggle theme", exact: true });
      await expect(icon).toHaveAttribute("src", "/icon-light.png");
      await expect.poll(() => icon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      await expect(favicon).toHaveAttribute("href", "/icon-light.png");
      await expect(toggle).toBeHidden();
      await open.click();
      await expect(page.getByRole("menuitemradio", { name: /English/ })).toBeVisible();
      await page.getByRole("menuitemradio", { name: /English/ }).press("Escape");
      await expect(open).toBeFocused();
      await expect(toggle).toBeHidden();
      await open.click();
      await page.locator("main").click({ position: { x: 5, y: 5 } });
      await expect(toggle).toBeHidden();
      await open.click();
      await toggle.click();
      await expect(icon).toHaveAttribute("src", "/icon.png");
      await expect(favicon).toHaveAttribute("href", "/icon.png");
      await close.click();
      await page.getByRole("link", { name: locale === "it" ? "Home di Massimo Stefan" : "Massimo Stefan home", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}$`));
      await expect(favicon).toHaveAttribute("href", "/icon.png");
      if (width < 640) await open.click();
      await page.locator("header").getByRole("link", { name: locale === "it" ? "Lavori" : "Work", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/projects$`));
      await expect(icon).toHaveAttribute("src", "/icon.png");
      await expect(favicon).toHaveAttribute("href", "/icon.png");
      await page.reload();
      await expect(icon).toHaveAttribute("src", "/icon.png");
      await expect(favicon).toHaveAttribute("href", "/icon.png");
      await open.click();
      await toggle.click();
      await expect(icon).toHaveAttribute("src", "/icon-light.png");
      await expect(favicon).toHaveAttribute("href", "/icon-light.png");
      const english = page.getByRole("menuitemradio", { name: /English/ });
      await english.focus();
      await english.press("ArrowDown");
      await expect(page.getByRole("menuitemradio", { name: /Italiano/ })).toBeFocused();
      await page.getByRole("menuitemradio", { name: locale === "it" ? /English/ : /Italiano/ }).press("Enter");
      const nextLocale = locale === "it" ? "en" : "it";
      await expect(page).toHaveURL(new RegExp(`/${nextLocale}/projects$`));
      await expect(favicon).toHaveAttribute("href", "/icon-light.png");
      await expect(page.getByRole("menuitemradio", { name: /English/ })).toBeHidden();
    });
  }
}
