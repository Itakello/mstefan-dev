"use client";

import { BookOpen, Presentation, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Monitor, Smartphone, Trophy } from "lucide-react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DocumentPreview } from "@/components/DocumentPreview";
import { PreviewArrows } from "@/components/PreviewArrows";
import { StackBadge } from "@/components/StackBadge";
import { BrandIcon } from "@/components/BrandIcon";
import { ICON_LINK_COLOR_CLASS } from "@/lib/iconStyles";
import { StackCategoryIcon } from "@/components/StackCatalog";
import { displayStackCategory, groupStackEntries, projectStackLabels, resolveProjectStack } from "@/lib/stack";
import type { WebsiteStackState } from "@/lib/websiteStack";
import { getCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/config";
import { type ShowcaseWebsite, websitePreviewUrl } from "@/lib/websiteShowcase";

function ScreenshotPreview({ url, title, mobile, unavailable, direction }: { url: string; title: string; mobile: boolean; unavailable: string; direction: number }) {
  const image = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  const reducedMotion = useReducedMotion();
  const present = useIsPresent();
  useEffect(() => {
    if (image.current?.complete && image.current.naturalWidth === 0) setFailed(true);
  }, []);
  return (
    <motion.div className="absolute inset-0 flex justify-center" custom={direction} aria-hidden={!present}
      variants={{ enter: (step: number) => ({ x: reducedMotion ? 0 : `${step * 100}%` }), exit: (step: number) => ({ x: reducedMotion ? 0 : `${step * -100}%` }) }}
      initial="enter" animate={{ x: 0 }} exit="exit" transition={{ duration: reducedMotion ? 0 : 0.26, ease: [0.22, 0.61, 0.36, 1] }}>
      {failed ? <p role="status" className="text-sm text-black/60 dark:text-white/60">{unavailable}</p> : <img ref={image} src={url} alt={title} width={mobile ? 390 : 1280} height={mobile ? 844 : 800}
        className="h-full w-auto max-w-full rounded-xl border border-black/10 object-contain dark:border-white/15"
        draggable={false} onError={() => setFailed(true)} />}
    </motion.div>
  );
}

export function WorkExplorer({ locale, items, stackCatalog }: { locale: Locale; items: ShowcaseWebsite[]; stackCatalog: WebsiteStackState }) {
  const copy = getCopy(locale);
  const [documentKind, setDocumentKind] = useState<"paper" | "slides">("paper");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageDirection, setPageDirection] = useState(1);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [mobile, setMobile] = useState(false);
  const stackScroll = useRef<HTMLDivElement>(null);
  const [moreStack, setMoreStack] = useState(false);
  const [moreStackColumns, setMoreStackColumns] = useState(false);
  const [stackScrollable, setStackScrollable] = useState(false);
  const [stackLabel, setStackLabel] = useState<{ name: string; category: string; right: number; top: number } | null>(null);
  const dismissStackLabel = () => {
    setStackLabel(null);
    stackScroll.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(detail => { detail.open = false; });
  };
  const updateStackLabel = () => {
    const scroller = stackScroll.current;
    const focused = document.activeElement;
    if (scroller && focused instanceof HTMLElement && focused.matches("summary") && scroller.contains(focused)) {
      const rect = focused.getBoundingClientRect();
      const viewport = scroller.getBoundingClientRect();
      if (rect.bottom > Math.max(0, viewport.top) && rect.top < Math.min(window.innerHeight, viewport.bottom) && rect.right > Math.max(0, viewport.left) && rect.left < Math.min(window.innerWidth, viewport.right)) {
        showStackLabel(focused, focused.dataset.stackName!, focused.dataset.stackCategory ?? "");
      } else dismissStackLabel();
    } else dismissStackLabel();
  };
  useEffect(() => {
    window.addEventListener("scroll", updateStackLabel, true);
    window.addEventListener("resize", dismissStackLabel);
    return () => {
      window.removeEventListener("scroll", updateStackLabel, true);
      window.removeEventListener("resize", dismissStackLabel);
    };
  }, []);
  const showStackLabel = (element: HTMLElement, name: string, category: string) => {
    const rect = element.getBoundingClientRect();
    setStackLabel({ name, category, right: Math.min(window.innerWidth - 168, Math.max(8, window.innerWidth - rect.right)), top: Math.min(rect.bottom + 6, window.innerHeight - 60) });
  };
  const updateStackOverflow = () => {
    const element = stackScroll.current;
    setStackScrollable(Boolean(element && (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)));
    setMoreStack(Boolean(element && element.scrollHeight > element.clientHeight + element.scrollTop + 1));
    setMoreStackColumns(Boolean(element && element.scrollWidth > element.clientWidth + element.scrollLeft + 1));
  };
  const [selectedId, setSelectedId] = useState(items[0]?.id);
  const selected = items.find(item => item.id === selectedId) || items[0];
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("project");
    const initial = items.find(item => item.id === requested || item.name === requested);
    if (initial) setSelectedId(initial.id);
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
  const previewPages = selected.previewImages?.length
    ? selected.previewImages.map(image => ({ label: image.label, screenshots: { desktop: image.url, mobile: image.url } }))
    : selected.screenshotPages;
  const selectedPage = previewPages?.[pageIndex] || previewPages?.[0];
  const screenshotUrl = selectedPage?.screenshots[mobile ? "mobile" : "desktop"];
  const visitUrl = websitePreviewUrl(selected, locale);
  const groups = groupStackEntries(resolveProjectStack(projectStackLabels(selected), stackCatalog.entries));
  const hasStackColumn = groups.length > 0 || Boolean(stackCatalog.message);
  const metadata = [selected.type ? copy.work.types[selected.type] : undefined, selected.year, groups.length ? undefined : selected.language].filter(Boolean);
  const linkClass = `inline-flex items-center gap-2 text-sm font-medium ${ICON_LINK_COLOR_CLASS}`;
  const selectProject = (id: string) => { setSelectedId(id); setDocumentKind("paper"); setPageIndex(0); };
  const changePreview = (direction: number) => {
    const count = previewPages?.length ?? 0;
    if (count < 2) return;
    setPageDirection(direction);
    setPageIndex(index => (index + direction + count) % count);
  };
  return (
    <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[288px_minmax(0,1fr)] lg:gap-6">
      <label className="block min-w-0 text-sm font-medium lg:hidden">
        {copy.work.selectorLabel}
        <select value={selected.id} onChange={event => selectProject(event.target.value)} className="mt-2 block w-full min-w-0 rounded-lg border border-[var(--surface-border)] bg-[var(--page-bg)] px-3 py-3 text-base text-[var(--page-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))]">
          {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <nav aria-label={copy.work.selectorLabel} className="hidden self-start lg:block">
        {items.map(item => <button key={item.id} type="button" onClick={() => selectProject(item.id)}
          aria-label={copy.websites.selectSite(item.name)} aria-current={item.id === selected.id ? "true" : undefined}
          className={`block w-full border-b border-black/10 px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))] dark:border-white/10 ${item.id === selected.id ? "border-l-4 border-l-[hsl(var(--accent))] bg-[hsl(var(--accent)/0.05)]" : "hover:bg-black/[0.03] dark:hover:bg-white/5"}`}>
          <span className="flex flex-wrap items-center gap-2"><span className="font-semibold [overflow-wrap:anywhere]">{item.name}</span>{item.type && <span className="rounded-full border border-black/10 px-2 py-0.5 text-[10px] font-medium text-black/60 dark:border-white/15 dark:text-white/60">{copy.work.types[item.type]}</span>}</span>
          <span className="mt-1 line-clamp-1 text-sm leading-5 text-black/60 dark:text-white/60">{item.shortDescription || item.description}</span>
        </button>)}
      </nav>
      <section aria-labelledby="selected-work-title" className="min-w-0 lg:border-l lg:border-black/10 lg:pl-6 dark:lg:border-white/10">
        <div className={`grid ${hasStackColumn ? "grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(112px,45%)] sm:gap-6" : "grid-cols-1"}`}>
          <div className="min-w-0">
            <h2 id="selected-work-title" className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{selected.name}</h2>
            {metadata.length > 0 && <p className="mt-2 text-xs text-black/55 dark:text-white/55">{metadata.join(" · ")}</p>}
            <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-6 text-black/70 dark:text-white/70">{selected.description}</p>
            {selected.publication && <p className="mt-3 flex min-w-0 items-center gap-2 text-sm text-black/65 dark:text-white/65">
              <Trophy size={16} className="shrink-0 text-[hsl(var(--accent))]" aria-hidden />
              {selected.paperUrl ? <a className="truncate underline underline-offset-4" href={selected.paperUrl} target="_blank" rel="noreferrer" title={selected.publication}>{selected.publication}</a> : <span className="truncate" title={selected.publication}>{selected.publication}</span>}
            </p>}
            <div className="mt-4 flex flex-wrap gap-5">
              {visitUrl && <a className={linkClass} href={visitUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} aria-hidden="true" />{copy.work.visit}</a>}
              {selected.sourceUrl && <a className={linkClass} href={selected.sourceUrl} target="_blank" rel="noreferrer"><BrandIcon brand="github" />{copy.work.source}</a>}
            </div>
          </div>
          {groups.length > 0 ? <aside aria-label={copy.projectCard.technologiesByCategory(selected.name)} className="relative w-full max-w-full self-start min-h-0 min-w-0 sm:w-fit sm:justify-self-end">
            <div className="flex flex-col sm:pl-3">
            <h3 className="text-left text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50 sm:text-right">Stack</h3>
            <div ref={stackScroll} data-work-stack-scroll tabIndex={stackScrollable ? 0 : undefined} className="mt-3 overflow-visible overscroll-contain sm:h-[158px] sm:overflow-auto sm:pr-1" onScroll={updateStackOverflow}>
            <ul className="grid grid-cols-[repeat(auto-fill,28px)] items-start gap-2 sm:min-w-max sm:grid-flow-col sm:auto-cols-[28px] sm:grid-cols-none">
              {groups.map(group => <li key={group.category} aria-label={displayStackCategory(group.category, locale)}>
                <details className="mb-3 border-b border-black/10 pb-2 dark:border-white/10" onToggle={event => {
                  if (event.currentTarget.open) showStackLabel(event.currentTarget, displayStackCategory(group.category, locale), "");
                  else updateStackLabel();
                }} onMouseLeave={event => { if (!event.currentTarget.open) updateStackLabel(); }}>
                  <summary data-stack-name={displayStackCategory(group.category, locale)} aria-label={displayStackCategory(group.category, locale)} onMouseEnter={event => showStackLabel(event.currentTarget, displayStackCategory(group.category, locale), "")}
                    onFocus={event => showStackLabel(event.currentTarget, displayStackCategory(group.category, locale), "")}
                    onBlur={() => setStackLabel(null)} className="grid size-7 cursor-pointer list-none place-items-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))] [&::-webkit-details-marker]:hidden">
                    <StackCategoryIcon category={group.category} className="size-5 opacity-80" />
                  </summary>
                </details>
                <ul className="flex flex-col gap-2">
              {group.entries.map(entry => <li key={entry.name}>
                <details className="group relative" onToggle={event => {
                  if (event.currentTarget.open) showStackLabel(event.currentTarget, entry.name, displayStackCategory(group.category, locale));
                  else updateStackLabel();
                }} onMouseLeave={event => { if (!event.currentTarget.open) updateStackLabel(); }}>
                  <summary data-stack-name={entry.name} data-stack-category={displayStackCategory(group.category, locale)} aria-label={`${entry.name} · ${displayStackCategory(group.category, locale)}`} onMouseEnter={event => showStackLabel(event.currentTarget, entry.name, displayStackCategory(group.category, locale))}
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
            {moreStackColumns && <div aria-hidden className="pointer-events-none absolute bottom-0 right-0 top-7 flex w-5 items-center justify-end bg-gradient-to-l from-[var(--page-bg)] to-transparent"><ChevronRight size={14} /></div>}
            {moreStack && <div aria-hidden className="pointer-events-none absolute bottom-0 left-3 right-0 flex h-6 items-end justify-center bg-gradient-to-t from-[var(--page-bg)] to-transparent"><ChevronDown size={14} /></div>}
            </div>
          </aside> : stackCatalog.message && <p role="status" className="text-xs leading-5 text-black/55 dark:text-white/55">{copy.publication.stack[stackCatalog.message]}</p>}
        </div>
        {screenshotUrl && <div className="mt-7">
            {previewPages && (previewPages.length > 1 || selected.previewImages?.length) && <div role="group" aria-label={copy.work.previewPage} className="mb-4 flex items-center justify-between gap-3 text-sm">
              <span aria-live="polite" aria-atomic="true">{selectedPage.label} <span className="text-[var(--page-muted)]">· {pageIndex + 1} / {previewPages.length}</span></span>
            </div>}
            <div data-work-preview data-preview-stage className={`relative ${selected.previewImages?.length ? "aspect-[4/3] max-h-[min(620px,70svh)]" : "aspect-[8/5] max-h-[min(620px,70svh)]"} w-full overflow-hidden`} style={{ touchAction: "pan-y pinch-zoom" }}
              onTouchStart={event => { swipeStart.current = event.touches.length === 1 && window.matchMedia("(max-width: 639px)").matches ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }}
              onTouchCancel={() => { swipeStart.current = null; }}
              onTouchEnd={event => {
                const start = swipeStart.current;
                swipeStart.current = null;
                if (!start || !event.changedTouches.length) return;
                const dx = event.changedTouches[0].clientX - start.x;
                const dy = event.changedTouches[0].clientY - start.y;
                if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) changePreview(dx < 0 ? 1 : -1);
              }}>
              <AnimatePresence key={`${selected.id}-${mobile}`} initial={false} custom={pageDirection}>
                <ScreenshotPreview key={screenshotUrl} url={screenshotUrl} title={selected.previewImages?.length ? `${selected.name}: ${selectedPage.label}` : `${mobile ? copy.work.mobile : copy.work.desktop}: ${copy.websites.previewTitle(selected.name)}`} mobile={mobile && !selected.previewImages?.length} unavailable={copy.websites.unavailable} direction={pageDirection} />
              </AnimatePresence>
              {previewPages && previewPages.length > 1 && <PreviewArrows previous={copy.work.previousPreview} next={copy.work.nextPreview} onPrevious={() => changePreview(-1)} onNext={() => changePreview(1)} />}
            </div>
            {!selected.previewImages?.length && <div role="group" aria-label={copy.work.previewSize} className="mt-4 ml-auto flex w-fit gap-1 rounded-lg border border-black/10 p-1 dark:border-white/15">
              {([{ mobile: false, label: copy.work.desktop, Icon: Monitor }, { mobile: true, label: copy.work.mobile, Icon: Smartphone }]).map(mode => (
                <button key={mode.label} type="button" aria-pressed={mobile === mode.mobile} onClick={() => setMobile(mode.mobile)}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))] ${mobile === mode.mobile ? "bg-[hsl(var(--accent))] text-white" : "text-black/65 hover:bg-black/5 dark:text-white/65 dark:hover:bg-white/5"}`}>
                  <mode.Icon size={16} aria-hidden="true" />{mode.label}
                </button>
              ))}
            </div>}
          </div>}
        {(selected.paperUrl || selected.slidesUrl) && <section aria-label={copy.work.research} className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
          <h3 className="text-sm font-semibold">{copy.work.research}</h3>
          {(selected.paperUrl || selected.slidesUrl) && <>
            <DocumentPreview key={`${selected.id}-${documentKind}`} url={(documentKind === "slides" && selected.slidesUrl ? selected.slidesUrl : selected.paperUrl || selected.slidesUrl)!} title={selected.name} locale={locale} presentation={Boolean(selected.slidesUrl && (documentKind === "slides" || !selected.paperUrl))} />
            <div role="group" aria-label={copy.work.research} className="mt-4 ml-auto flex w-fit gap-1 rounded-lg border border-black/10 p-1 dark:border-white/15">
              {([{ kind: "paper", url: selected.paperUrl, label: copy.work.paper, Icon: BookOpen }, { kind: "slides", url: selected.slidesUrl, label: copy.work.slides, Icon: Presentation }] as const).filter(resource => resource.url).map(resource => {
                const active = (documentKind === "slides" && selected.slidesUrl ? "slides" : selected.paperUrl ? "paper" : "slides") === resource.kind;
                return <button key={resource.kind} type="button" aria-pressed={active} onClick={() => setDocumentKind(resource.kind)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))] ${active ? "bg-[hsl(var(--accent))] text-white" : "hover:bg-black/5 dark:hover:bg-white/5"}`}><resource.Icon size={16} aria-hidden /><span>{resource.label}</span></button>;
              })}
            </div>
          </>}
        </section>}
        {selected.url && !selected.preview && <p className="mt-6 text-sm text-black/60 dark:text-white/60">{copy.websites.linkOnly}</p>}
      </section>
      {stackLabel && createPortal(<span data-work-stack-label aria-hidden className="pointer-events-none fixed z-50 max-w-40 rounded-md border border-black/10 bg-white px-2 py-1 text-xs shadow-md dark:border-white/15 dark:bg-zinc-900" style={{ right: stackLabel.right, top: stackLabel.top }}>
        <span className="block font-medium">{stackLabel.name}</span>
        {stackLabel.category && <span className="block text-black/55 dark:text-white/55">{stackLabel.category}</span>}
      </span>, document.body)}
    </div>
  );
}
