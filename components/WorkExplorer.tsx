"use client";

import { BookOpen, Presentation, ChevronDown, ChevronRight, ExternalLink, Github, Monitor, Smartphone, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DocumentPreview } from "@/components/DocumentPreview";
import { StackBadge } from "@/components/StackBadge";
import { StackCategoryIcon } from "@/components/StackCatalog";
import { displayStackCategory, groupStackEntries, projectStackLabels, resolveProjectStack } from "@/lib/stack";
import type { WebsiteStackState } from "@/lib/websiteStack";
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

function ResponsivePreview({ url, title, mobile, sandbox }: { url: string; title: string; mobile: boolean; sandbox?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  const width = mobile ? 390 : 1280;
  const scale = mobile ? Math.min(1, available.width / width) : Math.min(1, available.width / width, available.height / 800);
  const height = mobile && scale > 0 ? available.height / scale : 800;
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setAvailable({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={container} className="relative w-full" style={{ height: "min(620px, 70svh)" }}>
      <div className="absolute left-1/2 overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/15 dark:bg-black"
        style={{ width: width * scale, height: height * scale, transform: "translateX(-50%)" }}>
        <iframe src={url} title={title} width={width} height={height}
          className="block origin-top-left border-0" style={{ width, height, transform: `scale(${scale})` }}
          referrerPolicy="strict-origin-when-cross-origin" sandbox={sandbox} />
      </div>
    </div>
  );
}

export function WorkExplorer({ locale, items, stackCatalog }: { locale: Locale; items: ShowcaseWebsite[]; stackCatalog: WebsiteStackState }) {
  const copy = getCopy(locale);
  const [documentKind, setDocumentKind] = useState<"paper" | "slides">("paper");
  const [mobile, setMobile] = useState(false);
  const stackScroll = useRef<HTMLDivElement>(null);
  const [moreStack, setMoreStack] = useState(false);
  const [moreStackColumns, setMoreStackColumns] = useState(false);
  const [stackLabel, setStackLabel] = useState<{ name: string; category: string; right: number; top: number } | null>(null);
  const dismissStackLabel = () => {
    setStackLabel(null);
    stackScroll.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(detail => { detail.open = false; });
  };
  useEffect(() => {
    const handleScroll = () => {
      const scroller = stackScroll.current;
      const focused = document.activeElement;
      if (scroller && focused instanceof HTMLElement && focused.matches("summary") && scroller.contains(focused)) {
        const rect = focused.getBoundingClientRect();
        const viewport = scroller.getBoundingClientRect();
        if (rect.bottom > Math.max(0, viewport.top) && rect.top < Math.min(window.innerHeight, viewport.bottom) && rect.right > Math.max(0, viewport.left) && rect.left < Math.min(window.innerWidth, viewport.right)) {
          const [name, category = ""] = focused.getAttribute("aria-label")!.split(" · ");
          showStackLabel(focused, name, category);
        } else dismissStackLabel();
      } else dismissStackLabel();
    };
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", dismissStackLabel);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", dismissStackLabel);
    };
  }, []);
  const showStackLabel = (element: HTMLElement, name: string, category: string) => {
    const rect = element.getBoundingClientRect();
    setStackLabel({ name, category, right: Math.min(window.innerWidth - 168, Math.max(8, window.innerWidth - rect.right)), top: Math.min(rect.bottom + 6, window.innerHeight - 60) });
  };
  const updateStackOverflow = () => {
    const element = stackScroll.current;
    setMoreStack(Boolean(element && element.scrollHeight > element.clientHeight + element.scrollTop + 1));
    setMoreStackColumns(Boolean(element && element.scrollWidth > element.clientWidth + element.scrollLeft + 1));
  };
  const [selectedId, setSelectedId] = useState(items[0]?.id);
  const selected = items.find(item => item.id === selectedId) || items[0];
  const [parentOrigin, setParentOrigin] = useState("");
  const [depth, setDepth] = useState<number | null>(null);
  const [origin, setOrigin] = useState(personalPreviewOrigin("", ""));
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("project");
    const initial = items.find(item => item.id === requested || item.name === requested);
    if (initial) setSelectedId(initial.id);
    setDepth(ancestorDepth());
    setParentOrigin(window.location.origin);
    setOrigin(personalPreviewOrigin(window.location.hostname, window.location.origin));
  }, []);
  useEffect(() => {
    const element = stackScroll.current;
    if (!element) return;
    element.scrollTop = 0;
    element.scrollLeft = 0;
    setStackLabel(null);
    const observer = new ResizeObserver(updateStackOverflow);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    updateStackOverflow();
    return () => observer.disconnect();
  }, [selected?.id, stackCatalog]);
  if (!selected) return null;
  const previewUrl = websitePreviewUrl(selected, locale, origin);
  const visitUrl = websitePreviewUrl(selected, locale);
  const groups = groupStackEntries(resolveProjectStack(projectStackLabels(selected), stackCatalog.entries));
  const hasStackColumn = groups.length > 0 || Boolean(stackCatalog.message);
  const metadata = [selected.type ? copy.work.types[selected.type] : undefined, selected.year, groups.length ? undefined : selected.language].filter(Boolean);
  const linkClass = "inline-flex items-center gap-2 text-sm font-medium";
  return (
    <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[288px_minmax(0,1fr)] lg:gap-6">
      <nav aria-label={copy.work.selectorLabel} className="max-h-64 overflow-y-auto lg:max-h-[760px]">
        {items.map(item => <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setDocumentKind("paper"); }}
          aria-label={copy.websites.selectSite(item.name)} aria-current={item.id === selected.id ? "true" : undefined}
          className={`block w-full border-b border-black/10 px-4 py-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))] dark:border-white/10 ${item.id === selected.id ? "border-l-4 border-l-[hsl(var(--accent))] bg-[hsl(var(--accent)/0.05)]" : "hover:bg-black/[0.03] dark:hover:bg-white/5"}`}>
          <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{item.name}</span>{item.type && <span className="rounded-full border border-black/10 px-2 py-0.5 text-[10px] font-medium text-black/60 dark:border-white/15 dark:text-white/60">{copy.work.types[item.type]}</span>}</span>
          <span className="mt-1 block text-sm leading-5 text-black/60 dark:text-white/60">{item.shortDescription || item.description}</span>
        </button>)}
      </nav>
      <section aria-labelledby="selected-work-title" className="min-w-0 lg:border-l lg:border-black/10 lg:pl-6 dark:lg:border-white/10">
        <div className={`grid ${hasStackColumn ? "grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(112px,45%)] sm:gap-6" : "grid-cols-1"}`}>
          <div className="min-w-0">
            <h2 id="selected-work-title" className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{selected.name}</h2>
            {metadata.length > 0 && <p className="mt-2 text-xs text-black/55 dark:text-white/55">{metadata.join(" · ")}</p>}
            <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-6 text-black/70 dark:text-white/70">{selected.description}</p>
            <div className="mt-4 flex flex-wrap gap-5">
              {visitUrl && <a className={linkClass} href={visitUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} aria-hidden="true" />{copy.work.visit}</a>}
              {selected.sourceUrl && <a className={linkClass} href={selected.sourceUrl} target="_blank" rel="noreferrer"><Github size={16} aria-hidden="true" />{copy.work.source}</a>}
            </div>
          </div>
          {groups.length > 0 ? <aside aria-label={copy.projectCard.technologiesByCategory(selected.name)} className="relative self-start min-h-0 min-w-0 border-l border-black/10 dark:border-white/10">
            <div className="flex flex-col pl-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">Stack</h3>
            <div ref={stackScroll} data-work-stack-scroll tabIndex={0} className="mt-3 h-[158px] overflow-auto overscroll-contain pr-1" onScroll={updateStackOverflow}>
            <ul className="grid min-w-max grid-flow-col auto-cols-[28px] items-start gap-2">
              {groups.map(group => <li key={group.category} aria-label={displayStackCategory(group.category, locale)}>
                <details className="sticky top-0 z-10 mb-3 border-b border-black/10 bg-white pb-2 dark:border-white/10 dark:bg-black" onToggle={event => {
                  if (event.currentTarget.open) showStackLabel(event.currentTarget, displayStackCategory(group.category, locale), "");
                  else setStackLabel(null);
                }} onMouseLeave={event => { if (!event.currentTarget.open) setStackLabel(null); }}>
                  <summary aria-label={displayStackCategory(group.category, locale)} onMouseEnter={event => showStackLabel(event.currentTarget, displayStackCategory(group.category, locale), "")}
                    onFocus={event => showStackLabel(event.currentTarget, displayStackCategory(group.category, locale), "")}
                    onBlur={() => setStackLabel(null)} className="grid size-7 cursor-pointer list-none place-items-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))] [&::-webkit-details-marker]:hidden">
                    <StackCategoryIcon category={group.category} className="size-5 opacity-80" />
                  </summary>
                </details>
                <ul className="flex flex-col gap-2">
              {group.entries.map(entry => <li key={entry.name}>
                <details className="group relative" onToggle={event => {
                  if (event.currentTarget.open) showStackLabel(event.currentTarget, entry.name, displayStackCategory(group.category, locale));
                  else setStackLabel(null);
                }} onMouseLeave={event => { if (!event.currentTarget.open) setStackLabel(null); }}>
                  <summary aria-label={`${entry.name} · ${displayStackCategory(group.category, locale)}`} onMouseEnter={event => showStackLabel(event.currentTarget, entry.name, displayStackCategory(group.category, locale))}
                    onFocus={event => showStackLabel(event.currentTarget, entry.name, displayStackCategory(group.category, locale))}
                    onBlur={() => setStackLabel(null)} className="flex cursor-pointer list-none rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))] [&::-webkit-details-marker]:hidden">
                    <StackBadge item={entry} label={false} compact />
                  </summary>
                </details>
              </li>)}
                </ul>
              </li>)}
            </ul>
            </div>
            {moreStackColumns && <div aria-hidden className="pointer-events-none absolute bottom-0 right-0 top-7 flex w-5 items-center justify-end bg-gradient-to-l from-white to-transparent dark:from-black"><ChevronRight size={14} /></div>}
            {moreStack && <div aria-hidden className="pointer-events-none absolute bottom-0 left-3 right-0 flex h-6 items-end justify-center bg-gradient-to-t from-white to-transparent dark:from-black"><ChevronDown size={14} /></div>}
            </div>
          </aside> : stackCatalog.message && <p role="status" className="text-xs leading-5 text-black/55 dark:text-white/55">{copy.publication.stack[stackCatalog.message]}</p>}
        </div>
        {selected.publication && <section aria-label={copy.work.accomplishments} className="mt-4 rounded-lg border border-black/10 p-3 dark:border-white/10">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Trophy size={16} className="text-[hsl(var(--accent))]" aria-hidden />{copy.work.accomplishments}</h3>
          <p className="mt-2 text-sm text-black/65 dark:text-white/65">{selected.publication}</p>
        </section>}
        {(selected.paperUrl || selected.slidesUrl) && <section aria-label={copy.work.research} className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
          <h3 className="text-sm font-semibold">{copy.work.research}</h3>
          {(selected.paperUrl || selected.slidesUrl) && <>
            <div role="group" aria-label={copy.work.research} className="mt-4 mb-4 inline-flex gap-1 rounded-lg border border-black/10 p-1 dark:border-white/15">
              {([{ kind: "paper", url: selected.paperUrl, label: copy.work.paper, Icon: BookOpen }, { kind: "slides", url: selected.slidesUrl, label: copy.work.slides, Icon: Presentation }] as const).filter(resource => resource.url).map(resource => {
                const active = (documentKind === "slides" && selected.slidesUrl ? "slides" : selected.paperUrl ? "paper" : "slides") === resource.kind;
                return <button key={resource.kind} type="button" aria-pressed={active} onClick={() => setDocumentKind(resource.kind)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))] ${active ? "bg-[hsl(var(--accent))] text-white" : "hover:bg-black/5 dark:hover:bg-white/5"}`}><resource.Icon size={16} aria-hidden /><span>{resource.label}</span></button>;
              })}
            </div>
            <DocumentPreview key={`${selected.id}-${documentKind}`} url={(documentKind === "slides" && selected.slidesUrl ? selected.slidesUrl : selected.paperUrl || selected.slidesUrl)!} title={selected.name} locale={locale} presentation={Boolean(selected.slidesUrl && (documentKind === "slides" || !selected.paperUrl))} />
          </>}
        </section>}
        {selected.preview && previewUrl && (depth === null || !parentOrigin ? <p role="status" className="mt-6 text-sm">{copy.websites.loading}</p>
          : canRenderWebsitePreview(depth) ? <div className="mt-7">
            <div role="group" aria-label={copy.work.previewSize} className="mb-4 ml-auto flex w-fit gap-1 rounded-lg border border-black/10 p-1 dark:border-white/15">
              {([{ mobile: false, label: copy.work.desktop, Icon: Monitor }, { mobile: true, label: copy.work.mobile, Icon: Smartphone }]).map(mode => (
                <button key={mode.label} type="button" aria-pressed={mobile === mode.mobile} onClick={() => setMobile(mode.mobile)}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))] ${mobile === mode.mobile ? "bg-[hsl(var(--accent))] text-white" : "text-black/65 hover:bg-black/5 dark:text-white/65 dark:hover:bg-white/5"}`}>
                  <mode.Icon size={16} aria-hidden="true" />{mode.label}
                </button>
              ))}
            </div>
            <ResponsivePreview key={selected.id} url={previewUrl} title={`${mobile ? copy.work.mobile : copy.work.desktop}: ${copy.websites.previewTitle(selected.name)}`} mobile={mobile} sandbox={new URL(previewUrl).origin === parentOrigin ? undefined : "allow-scripts allow-same-origin allow-forms allow-popups"} />
          </div> : <p className="mt-6 text-sm text-black/60 dark:text-white/60">{copy.websites.depthLimit}</p>)}
        {selected.url && !selected.preview && <p className="mt-6 text-sm text-black/60 dark:text-white/60">{copy.websites.linkOnly}</p>}
      </section>
      {stackLabel && createPortal(<span data-work-stack-label aria-hidden className="fixed z-50 max-w-40 rounded-md border border-black/10 bg-white px-2 py-1 text-xs shadow-md dark:border-white/15 dark:bg-zinc-900" style={{ right: stackLabel.right, top: stackLabel.top }}>
        <span className="block font-medium">{stackLabel.name}</span>
        {stackLabel.category && <span className="block text-black/55 dark:text-white/55">{stackLabel.category}</span>}
      </span>, document.body)}
    </div>
  );
}
