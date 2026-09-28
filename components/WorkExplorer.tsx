"use client";

import { ExternalLink, Github } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/config";
import { canRenderWebsitePreview, personalPreviewOrigin, type ShowcaseWebsite, websitePreviewUrl } from "@/lib/websiteShowcase";

function ancestorDepth() {
  let current: Window = window;
  let depth = 0;
  while (current.parent !== current) {
    try {
      if (current.parent.location.origin !== current.location.origin) break;
      depth++;
      current = current.parent;
    } catch { break; }
  }
  return depth;
}

function ResponsivePreview({ url, title, mobile }: { url: string; title: string; mobile: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const width = mobile ? 390 : 1280;
  const height = mobile ? 780 : 800;
  const scale = Math.min(1, availableWidth / width);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={container} className="w-full overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/15 dark:bg-black" style={{ height: availableWidth ? height * scale : 200 }}>
      {availableWidth > 0 && <iframe src={url} title={title} width={width} height={height}
        className="block origin-top-left border-0" style={{ width, height, transform: `scale(${scale})` }}
        referrerPolicy="strict-origin-when-cross-origin" />}
    </div>
  );
}

export function WorkExplorer({ locale, items }: { locale: Locale; items: ShowcaseWebsite[] }) {
  const copy = getCopy(locale);
  const [selectedId, setSelectedId] = useState(items[0]?.id);
  const selected = items.find(item => item.id === selectedId) || items[0];
  const [depth, setDepth] = useState<number | null>(null);
  const [origin, setOrigin] = useState(personalPreviewOrigin("", ""));
  useEffect(() => {
    setDepth(ancestorDepth());
    setOrigin(personalPreviewOrigin(window.location.hostname, window.location.origin));
  }, []);
  if (!selected) return null;
  const previewUrl = websitePreviewUrl(selected, locale, origin);
  const visitUrl = websitePreviewUrl(selected, locale);
  const metadata = [selected.year, selected.language, ...(selected.tags || [])].filter(Boolean);
  const linkClass = "inline-flex items-center gap-2 text-sm font-medium";
  return (
    <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
      <nav aria-label={copy.work.selectorLabel} className="max-h-64 overflow-y-auto lg:max-h-[760px]">
        {items.map(item => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)}
          aria-label={copy.websites.selectSite(item.name)} aria-current={item.id === selected.id ? "true" : undefined}
          className={`block w-full border-b border-black/10 px-4 py-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))] dark:border-white/10 ${item.id === selected.id ? "border-l-4 border-l-[hsl(var(--accent))] bg-[hsl(var(--accent)/0.05)]" : "hover:bg-black/[0.03] dark:hover:bg-white/5"}`}>
          <span className="block font-semibold">{item.name}</span>
          <span className="mt-1 block text-sm leading-5 text-black/60 dark:text-white/60">{item.shortDescription || item.description}</span>
        </button>)}
      </nav>
      <section aria-labelledby="selected-work-title" className="min-w-0 lg:border-l lg:border-black/10 lg:pl-8 dark:lg:border-white/10">
        <h2 id="selected-work-title" className="text-2xl font-semibold tracking-tight">{selected.name}</h2>
        {metadata.length > 0 && <p className="mt-2 text-xs text-black/55 dark:text-white/55">{metadata.join(" · ")}</p>}
        <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-6 text-black/70 dark:text-white/70">{selected.description}</p>
        <div className="mt-4 flex flex-wrap gap-5">
          {visitUrl && <a className={linkClass} href={visitUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} aria-hidden="true" />{copy.work.visit}</a>}
          {selected.sourceUrl && <a className={linkClass} href={selected.sourceUrl} target="_blank" rel="noreferrer"><Github size={16} aria-hidden="true" />{copy.work.source}</a>}
        </div>
        {selected.preview && previewUrl && (depth === null ? <p role="status" className="mt-6 text-sm">{copy.websites.loading}</p>
          : canRenderWebsitePreview(depth) ? <div key={selected.id} className="mt-7 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0"><h3 className="mb-2 text-xs text-black/55 dark:text-white/55">{copy.work.desktop}</h3>
              <ResponsivePreview url={previewUrl} title={`${copy.work.desktop}: ${copy.websites.previewTitle(selected.name)}`} mobile={false} /></div>
            <div className="mx-auto w-full max-w-[260px] xl:max-w-none"><h3 className="mb-2 text-xs text-black/55 dark:text-white/55">{copy.work.mobile}</h3>
              <ResponsivePreview url={previewUrl} title={`${copy.work.mobile}: ${copy.websites.previewTitle(selected.name)}`} mobile /></div>
          </div> : <p className="mt-6 text-sm text-black/60 dark:text-white/60">{copy.websites.depthLimit}</p>)}
        {selected.url && !selected.preview && <p className="mt-6 text-sm text-black/60 dark:text-white/60">{copy.websites.linkOnly}</p>}
      </section>
    </div>
  );
}
