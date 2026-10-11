import { Download, ExternalLink } from "lucide-react";
import { documentMediaUrl } from "@/lib/documentMedia";
import { powerPointPreviewUrl } from "@/lib/powerPointPreview";
import type { Locale } from "@/lib/i18n/config";

export function PowerPointPreview({ url, title, locale }: { url: string; title: string; locale: Locale }) {
  const source = documentMediaUrl(url);
  const viewer = powerPointPreviewUrl(url, locale);
  const italian = locale === "it";
  const link = "inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))]";
  return <section data-powerpoint-preview aria-label={`${title}: PowerPoint`} className="overflow-hidden rounded-xl border border-[var(--surface-border)]">
    {viewer ? <iframe src={viewer} title={`${title}: PowerPoint`} allowFullScreen loading="lazy" className="aspect-video min-h-64 w-full border-0 sm:min-h-0" />
      : <p role="status" className="p-4 text-sm">{italian ? "Anteprima non disponibile. Scarica il PowerPoint per aprirlo." : "Preview unavailable. Download the PowerPoint to open it."}</p>}
    <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--surface-border)] p-1">
      <a href={source} download className={link}>{italian ? "Scarica PowerPoint" : "Download PowerPoint"}<Download size={14} aria-hidden /></a>
      {viewer && <a href={viewer} target="_blank" rel="noreferrer" className={link}>{italian ? "Apri PowerPoint" : "Open PowerPoint"}<ExternalLink size={14} aria-hidden /></a>}
    </div>
  </section>;
}
