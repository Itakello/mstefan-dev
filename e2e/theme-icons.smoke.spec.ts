import { expect, test } from "@playwright/test";

for (const locale of ["en", "it"]) {
  for (const width of [1280, 390]) {
    test(`${locale} ${width}px header and favicon follow the selected theme`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.setExtraHTTPHeaders({ "x-real-ip": "127.0.0.1" });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.addInitScript(() => {
        if (!localStorage.getItem("theme")) localStorage.setItem("theme", "light");
      });
      await page.goto(`/${locale}/icon-check`);
      const icon = page.locator("header img:visible");
      const favicon = page.locator('link[rel="icon"]');
      const toggle = page.getByRole("button", { name: locale === "it" ? "Cambia tema" : "Toggle theme", exact: true });
      await expect(icon).toHaveAttribute("src", "/icon-light.svg");
      await expect.poll(() => icon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      await expect(favicon).toHaveAttribute("href", "/icon-light.svg");
      await toggle.click();
      await expect(icon).toHaveAttribute("src", "/icon.svg");
      await expect(favicon).toHaveAttribute("href", "/icon.svg");
      await page.getByRole("link", { name: locale === "it" ? "Home di Massimo Stefan" : "Massimo Stefan home", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}$`));
      await expect(favicon).toHaveAttribute("href", "/icon.svg");
      if (width < 640) {
        await page.getByRole("button", { name: locale === "it" ? "Apri navigazione" : "Open navigation", exact: true }).click();
      }
      await page.locator("header").getByRole("link", { name: locale === "it" ? "Lavori" : "Work", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/projects$`));
      await expect(icon).toHaveAttribute("src", "/icon.svg");
      await expect(favicon).toHaveAttribute("href", "/icon.svg");
      await page.reload();
      await expect(icon).toHaveAttribute("src", "/icon.svg");
      await expect(favicon).toHaveAttribute("href", "/icon.svg");
      await toggle.click();
      await expect(icon).toHaveAttribute("src", "/icon-light.svg");
      await expect(favicon).toHaveAttribute("href", "/icon-light.svg");
    });
  }
}
