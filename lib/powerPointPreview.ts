import { documentMediaUrl } from "./documentMedia";
import type { Locale } from "./i18n/config";

export function powerPointPreviewUrl(value: string, locale: Locale): string | null {
  const original = new URL(value);
  if (original.search || original.hash || original.username || original.password || original.port) return null;
  const source = new URL(documentMediaUrl(value));
  if (source.hostname !== "raw.githubusercontent.com" || source.port || source.search || source.hash
    || !source.pathname.toLowerCase().endsWith(".pptx")) return null;
  const viewer = new URL("https://view.officeapps.live.com/op/embed.aspx");
  viewer.searchParams.set("src", source.href);
  viewer.searchParams.set("ui", locale === "it" ? "it-IT" : "en-US");
  return viewer.href;
}
