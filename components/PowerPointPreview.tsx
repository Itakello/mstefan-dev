"use client";
import { useRef, type ReactNode } from "react";
import { PreviewArrows } from "./PreviewArrows";
import { presentationPreviewUrl } from "@/lib/powerPointPreview";
import type { Locale } from "@/lib/i18n/config";

export function PowerPointPreview({ url, title, locale, previewUrl, enlarge }: { url: string; title: string; locale: Locale; previewUrl?: string; enlarge?: ReactNode }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const advance = (key: "ArrowLeft" | "ArrowRight") => {
    frame.current?.contentWindow?.document.dispatchEvent(new KeyboardEvent("keydown", { key, keyCode: key === "ArrowLeft" ? 37 : 39, shiftKey: key === "ArrowLeft", bubbles: true }));
  };
  const viewer = previewUrl ? presentationPreviewUrl(previewUrl) : null;
  const italian = locale === "it";
  return <section data-powerpoint-preview aria-label={`${title}: PowerPoint`}>
    <div className="media-caption">{title}</div>
    {viewer ? <div data-preview-stage className="media-frame"><iframe ref={frame} src={viewer} title={`${title}: PowerPoint`} allow="autoplay; fullscreen" allowFullScreen loading="lazy" className="aspect-video w-full border-0" />
      {enlarge}
      <PreviewArrows previous={italian ? "Passaggio precedente" : "Previous step"} next={italian ? "Passaggio successivo" : "Next step"} onPrevious={() => advance("ArrowLeft")} onNext={() => advance("ArrowRight")} />
      </div>
      : <p role="status" className="p-4 text-sm">{italian ? "Anteprima non disponibile. Scarica il PowerPoint per aprirlo." : "Preview unavailable. Download the PowerPoint to open it."}</p>}
  </section>;
}
