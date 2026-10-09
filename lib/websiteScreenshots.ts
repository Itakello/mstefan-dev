import { createHash } from "node:crypto";
import type { Locale } from "./i18n/config";

export function websiteScreenshotPaths(url: string, locale: Locale) {
  const key = createHash("sha256").update(new URL(url).href).digest("hex");
  const base = `/website-previews/${key}/${locale}`;
  return { desktop: `${base}-desktop.png`, mobile: `${base}-mobile.png` };
}
