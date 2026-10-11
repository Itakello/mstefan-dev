"use client";
import { useRef } from "react";
import { PreviewArrows } from "./PreviewArrows";
import { Download } from "lucide-react";
import { documentMediaUrl } from "@/lib/documentMedia";
import { presentationPreviewUrl } from "@/lib/powerPointPreview";
import type { Locale } from "@/lib/i18n/config";

export function PowerPointPreview({ url, title, locale, previewUrl }: { url: string; title: string; locale: Locale; previewUrl?: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const advance = (key: "ArrowLeft" | "ArrowRight") => {
    frame.current?.contentWindow?.document.dispatchEvent(new KeyboardEvent("keydown", { key, keyCode: key === "ArrowLeft" ? 37 : 39, shiftKey: key === "ArrowLeft", bubbles: true }));
  };
  const source = documentMediaUrl(url);
  const viewer = previewUrl ? presentationPreviewUrl(previewUrl) : null;
  const italian = locale === "it";
  const link = "inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))]";
  return <section data-powerpoint-preview aria-label={`${title}: PowerPoint`} className="overflow-hidden rounded-xl border border-[var(--surface-border)]">
    {viewer ? <div data-preview-stage className="relative"><iframe ref={frame} src={viewer} title={`${title}: PowerPoint`} allow="autoplay; fullscreen" allowFullScreen loading="lazy" className="aspect-video w-full border-0" />
      <PreviewArrows previous={italian ? "Passaggio precedente" : "Previous step"} next={italian ? "Passaggio successivo" : "Next step"} onPrevious={() => advance("ArrowLeft")} onNext={() => advance("ArrowRight")} />
      </div>
      : <p role="status" className="p-4 text-sm">{italian ? "Anteprima non disponibile. Scarica il PowerPoint per aprirlo." : "Preview unavailable. Download the PowerPoint to open it."}</p>}
    <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--surface-border)] p-1">
      <a href={source} download className={link}>{italian ? "Scarica PowerPoint" : "Download PowerPoint"}<Download size={14} aria-hidden /></a>
    </div>
  </section>;
}
