import { expect, test, type Page } from "@playwright/test";

export { expect, test };

export async function showReviewStep(page: Page, label: string) {
  await page.evaluate((text) => {
    const id = "playwright-review-step";
    const existing = document.getElementById(id);
    const banner = existing ?? document.body.appendChild(document.createElement("div"));
    banner.id = id;
    banner.textContent = text;
    Object.assign(banner.style, {
      background: "rgba(15, 23, 42, 0.94)",
      border: "1px solid rgba(255, 255, 255, 0.24)",
      borderRadius: "10px",
      bottom: "20px",
      color: "white",
      font: "600 18px/1.3 system-ui, sans-serif",
      left: "50%",
      maxWidth: "calc(100vw - 40px)",
      padding: "12px 18px",
      pointerEvents: "none",
      position: "fixed",
      transform: "translateX(-50%)",
      zIndex: "2147483647",
    });
  }, label);
  await page.waitForTimeout(650);
}
