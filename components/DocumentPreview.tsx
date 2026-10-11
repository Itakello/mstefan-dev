"use client";
import { Download, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Locale } from "@/lib/i18n/config";
import { documentMediaUrl } from "@/lib/documentMedia";
import { PreviewArrows } from "./PreviewArrows";
import { PowerPointPreview } from "./PowerPointPreview";

type DocumentPreviewProps = { url: string; title: string; locale: Locale; filename?: string | null; presentation?: boolean; previewUrl?: string; enlarge?: ReactNode };

export function DocumentPreview(props: DocumentPreviewProps) {
  return props.presentation && new URL(props.url, "https://www.mstefan.dev").pathname.toLowerCase().endsWith(".pptx")
    ? <PowerPointPreview url={props.url} title={props.title} locale={props.locale} previewUrl={props.previewUrl} enlarge={props.enlarge} />
    : <PdfDocumentPreview {...props} />;
}

function PdfDocumentPreview({ url, title, locale, filename, presentation = false, enlarge }: DocumentPreviewProps) {
  const host = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const pageHost = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState(url);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const italian = locale === "it";
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const updateViewport = () => setViewportHeight(window.innerHeight);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => { observer.disconnect(); window.removeEventListener("resize", updateViewport); };
  }, []);
  useEffect(() => {
    setDocument(null);
    setPage(1);
    setZoom(1);
    setStatus("loading");
    let disposed = false;
    let task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    async function load() {
      try {
        const pdf = await import("pdfjs-dist");
        if (disposed) return;
        pdf.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const source = documentMediaUrl(url, window.location.origin);
        setResolvedUrl(source);
        task = pdf.getDocument({ url: source });
        const loaded = await task.promise;
        if (!disposed) setDocument(loaded);
      } catch { if (!disposed) setStatus("error"); }
    }
    void load();
    return () => { disposed = true; void task?.destroy(); };
  }, [url]);
  useEffect(() => {
    if (!document || !width || !viewportHeight || !canvas.current) return;
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
        const maxHeight = Math.max(1, parseFloat(window.getComputedStyle(host.current!).maxHeight) - 24);
        const fit = Math.min(width / base.width, maxHeight / base.height);
        const viewport = pdfPage.getViewport({ scale: fit * zoom });
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
  }, [document, page, width, zoom, presentation, viewportHeight]);
  const control = "inline-flex items-center justify-center rounded-md p-2 hover:bg-black/5 disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))] dark:hover:bg-white/10";
  return <section data-pdf-preview aria-label={`${title}: ${italian ? "Lettore documenti" : "Document reader"}`} className={`mx-auto overflow-hidden rounded-xl border border-[var(--surface-border)] ${presentation ? "" : "max-w-[640px]"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 px-2 py-2 text-xs dark:border-white/15">
      <div className="flex items-center gap-1">
        <span className="px-2" aria-live="polite">{page} / {document?.numPages ?? "…"}</span>
      </div>
      <div className="flex items-center gap-1">
        {!presentation && <>
          <button type="button" className={control} disabled={zoom <= 1} aria-label={italian ? "Riduci" : "Zoom out"} onClick={() => setZoom(value => Math.max(1, value - 0.25))}><Minus size={16} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" className={control} disabled={zoom >= 2} aria-label={italian ? "Ingrandisci" : "Zoom in"} onClick={() => setZoom(value => Math.min(2, value + 0.25))}><Plus size={16} /></button>
        </>}
        <a href={resolvedUrl} download={filename || true} className={`${control} gap-1`}>{italian ? "Scarica PDF" : "Download PDF"}<Download size={14} /></a>
      </div>
    </div>
    <div data-preview-stage className="relative" style={{ touchAction: zoom > 1 ? "pan-x pan-y pinch-zoom" : "pan-y pinch-zoom" }}
      onTouchStart={event => { swipeStart.current = zoom === 1 && event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }}
      onTouchCancel={() => { swipeStart.current = null; }}
      onTouchEnd={event => {
        const start = swipeStart.current;
        swipeStart.current = null;
        if (!start || !event.changedTouches.length || !document) return;
        const dx = event.changedTouches[0].clientX - start.x;
        const dy = event.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) setPage(current => Math.max(1, Math.min(document.numPages, current + (dx < 0 ? 1 : -1))));
      }}>
    <div ref={host} data-document-stage className={`relative ${presentation ? "max-h-[min(480px,55svh)]" : "max-h-[min(640px,70svh)]"} overflow-auto bg-[var(--surface-bg)] p-3`}>
      {status === "loading" && <p role="status" className="absolute left-4 top-4 rounded bg-white/90 px-2 py-1 text-sm text-black">{italian ? "Caricamento documento…" : "Loading document…"}</p>}
      {status === "error" && <p role="status" className="text-sm">{italian ? "Anteprima non disponibile. Usa Scarica PDF per leggere il documento." : "Preview unavailable. Use Download PDF to read the document."}</p>}
      <div ref={pageHost} className={`relative mx-auto ${status === "error" ? "hidden" : ""}`}><canvas ref={canvas} role="img" aria-label={`${title} · ${italian ? "pagina" : "page"} ${page}`} className="bg-white shadow-sm" /><div ref={text} data-document-text /></div>
    </div>
    {enlarge}
    <PreviewArrows previous={italian ? "Pagina precedente" : "Previous page"} next={italian ? "Pagina successiva" : "Next page"}
      previousDisabled={!document || page === 1} nextDisabled={!document || page === document.numPages}
      onPrevious={() => setPage(current => Math.max(1, current - 1))} onNext={() => setPage(current => Math.min(document?.numPages ?? 1, current + 1))} />
    </div>
  </section>;
}
