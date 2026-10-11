"use client";

import { Maximize2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n/config";

export function MediaPreview({ title, locale, children, controls }: { title: string; locale: Locale; children: (enlarge: ReactNode) => ReactNode; controls?: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const enlarge = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const italian = locale === "it";
  useEffect(() => {
    const element = dialog.current;
    if (!element || !expanded) return;
    element.close();
    element.showModal();
    close.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [expanded]);
  return <><dialog ref={dialog} open data-media-preview data-media-expanded={expanded || undefined}
    aria-label={`${title}: ${italian ? "Anteprima" : "Media preview"}`} className="media-preview"
    onClose={() => {
      if (dialog.current?.open) return;
      setExpanded(false);
      dialog.current?.show();
      requestAnimationFrame(() => enlarge.current?.focus());
    }}>
    <div className={expanded ? "mb-2 flex justify-end" : "hidden"}>
      <button ref={close} type="button" onClick={() => dialog.current?.close()} aria-label={italian ? "Chiudi anteprima" : "Close preview"} className="media-preview-control"><X size={18} aria-hidden /></button>
    </div>
    {children(<button ref={enlarge} type="button" data-media-enlarge onClick={() => setExpanded(true)} aria-label={italian ? "Ingrandisci anteprima" : "Enlarge preview"} style={expanded ? { display: "none" } : undefined} className="media-preview-control absolute bottom-3 right-3 z-20 transition-opacity"><Maximize2 size={18} aria-hidden /></button>)}
  </dialog>
    {controls && <div data-media-controls className="mt-4 flex justify-center">{controls}</div>}
  </>;
}
