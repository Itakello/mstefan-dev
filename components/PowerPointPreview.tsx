"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PreviewArrows } from "./PreviewArrows";
import { presentationPreviewUrl, presentationProgress } from "@/lib/powerPointPreview";
import type { Locale } from "@/lib/i18n/config";

export function PowerPointPreview({ url, title, locale, previewUrl, enlarge }: { url: string; title: string; locale: Locale; previewUrl?: string; enlarge?: ReactNode }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const advance = (key: "ArrowLeft" | "ArrowRight") => {
    frame.current?.contentWindow?.document.dispatchEvent(new KeyboardEvent("keydown", { key, keyCode: key === "ArrowLeft" ? 37 : 39, shiftKey: key === "ArrowLeft", bubbles: true }));
  };
  const viewer = previewUrl ? presentationPreviewUrl(previewUrl) : null;
  const [progress, setProgress] = useState<ReturnType<typeof presentationProgress>>(null);
  useEffect(() => {
    setProgress(null);
    const update = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.type !== "mstefan:presentation-progress") return;
      const next = presentationProgress(event.data);
      if (next) setProgress(next);
    };
    window.addEventListener("message", update);
    return () => window.removeEventListener("message", update);
  }, [viewer]);
  const italian = locale === "it";
  return <section data-powerpoint-preview aria-label={`${title}: PowerPoint`}>
    {viewer ? <div data-preview-stage className="media-frame"><iframe ref={frame} src={viewer} onLoad={() => frame.current?.contentWindow?.postMessage({ type: "mstefan:presentation-progress-request" }, window.location.origin)} title={`${title}: PowerPoint`} allow="autoplay; fullscreen" allowFullScreen loading="lazy" className="block aspect-video w-full border-0" />
      {enlarge}
      <PreviewArrows previous={italian ? "Passaggio precedente" : "Previous step"} next={italian ? "Passaggio successivo" : "Next step"} onPrevious={() => advance("ArrowLeft")} onNext={() => advance("ArrowRight")} />
      </div>
      : <p role="status" className="p-4 text-sm">{italian ? "Anteprima non disponibile. Scarica il PowerPoint per aprirlo." : "Preview unavailable. Download the PowerPoint to open it."}</p>}
    <div className="media-caption" aria-live="polite">{title}{progress && <span className="text-[var(--page-muted)]"> · {progress.current} / {progress.total}</span>}</div>
  </section>;
}
