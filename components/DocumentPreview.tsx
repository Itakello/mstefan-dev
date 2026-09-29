"use client";
import { ChevronLeft, ChevronRight, ExternalLink, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Locale } from "@/lib/i18n/config";
import { documentMediaUrl } from "@/lib/documentMedia";

export function DocumentPreview({ url, title, locale }: { url: string; title: string; locale: Locale }) {
  const host = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const pageHost = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const italian = locale === "it";
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let disposed = false;
    let task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    async function load() {
      try {
        const pdf = await import("pdfjs-dist");
        if (disposed) return;
        pdf.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        task = pdf.getDocument({ url: documentMediaUrl(url) });
        const loaded = await task.promise;
        if (!disposed) setDocument(loaded);
      } catch { if (!disposed) setStatus("error"); }
    }
    void load();
    return () => { disposed = true; void task?.destroy(); };
  }, [url]);
  useEffect(() => {
    if (!document || !width || !canvas.current) return;
    let disposed = false;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    const element = canvas.current;
    let textLayer: InstanceType<typeof import("pdfjs-dist").TextLayer> | undefined;
    text.current?.replaceChildren();
    setStatus("loading");
    async function draw() {
      try {
        const pdfPage = await document!.getPage(page);
        if (disposed) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: Math.max(0.1, (width - 24) / base.width) * zoom });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        element.width = Math.ceil(viewport.width * ratio);
        element.height = Math.ceil(viewport.height * ratio);
        element.style.width = `${viewport.width}px`;
        element.style.height = `${viewport.height}px`;
        if (pageHost.current) {
          pageHost.current.style.width = `${viewport.width}px`;
          pageHost.current.style.height = `${viewport.height}px`;
          pageHost.current.style.setProperty("--total-scale-factor", String(viewport.scale));
        }
        render = pdfPage.render({ canvas: element, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
        await render.promise;
        if (disposed) return;
        if (text.current) {
          const { TextLayer } = await import("pdfjs-dist");
          if (disposed) return;
          text.current.replaceChildren();
          textLayer = new TextLayer({ container: text.current, viewport, textContentSource: pdfPage.streamTextContent({ includeMarkedContent: true }) });
          await textLayer.render();
        }
        if (!disposed) setStatus("ready");
      } catch { if (!disposed) setStatus("error"); }
    }
    void draw();
    return () => { disposed = true; render?.cancel(); textLayer?.cancel(); };
  }, [document, page, width, zoom]);
  const control = "inline-flex items-center justify-center rounded-md p-2 hover:bg-black/5 disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))] dark:hover:bg-white/10";
  return <section aria-label={`${title}: ${italian ? "Lettore documenti" : "Document reader"}`} className="overflow-hidden rounded-xl border border-black/10 dark:border-white/15">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 px-2 py-2 text-xs dark:border-white/15">
      <div className="flex items-center gap-1">
        <button type="button" className={control} disabled={!document || page === 1} aria-label={italian ? "Pagina precedente" : "Previous page"} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
        <span aria-live="polite">{page} / {document?.numPages ?? "…"}</span>
        <button type="button" className={control} disabled={!document || page === document.numPages} aria-label={italian ? "Pagina successiva" : "Next page"} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" className={control} disabled={zoom <= 1} aria-label={italian ? "Riduci" : "Zoom out"} onClick={() => setZoom(value => Math.max(1, value - 0.25))}><Minus size={16} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" className={control} disabled={zoom >= 2} aria-label={italian ? "Ingrandisci" : "Zoom in"} onClick={() => setZoom(value => Math.min(2, value + 0.25))}><Plus size={16} /></button>
        <a href={url} target="_blank" rel="noreferrer" className={`${control} gap-1`}>{italian ? "Apri PDF" : "Open PDF"}<ExternalLink size={14} /></a>
      </div>
    </div>
    <div ref={host} className="relative h-[min(680px,75svh)] overflow-auto overscroll-contain bg-zinc-100 p-3 dark:bg-zinc-900">
      {status === "loading" && <p role="status" className="absolute left-4 top-4 rounded bg-white/90 px-2 py-1 text-sm text-black">{italian ? "Caricamento documento…" : "Loading document…"}</p>}
      {status === "error" && <p role="status" className="text-sm">{italian ? "Anteprima non disponibile. Usa Apri PDF per leggere il documento." : "Preview unavailable. Use Open PDF to read the document."}</p>}
      <div ref={pageHost} className={`relative mx-auto ${status === "error" ? "hidden" : ""}`}><canvas ref={canvas} role="img" aria-label={`${title} · ${italian ? "pagina" : "page"} ${page}`} className="bg-white shadow-sm" /><div ref={text} data-document-text /></div>
    </div>
  </section>;
}
