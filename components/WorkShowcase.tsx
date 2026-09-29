"use client";

import { ExternalLink, Github, Monitor, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { ResponsivePreview, WorkExplorer, ancestorDepth } from "@/components/WorkExplorer";
import { getCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/config";
import type { WebsiteStackState } from "@/lib/websiteStack";
import {
  canRenderWebsitePreview, personalPreviewOrigin, type ShowcaseWebsite, websitePreviewUrl,
} from "@/lib/websiteShowcase";

function SitePeek({ item, locale, origin, depth, onSelect }: {
  item: ShowcaseWebsite; locale: Locale; origin: string; depth: number | null; onSelect: () => void;
}) {
  const url = websitePreviewUrl(item, locale, origin);
  return <button type="button" onClick={onSelect} aria-label={getCopy(locale).websites.selectSite(item.name)}
    className="group relative hidden h-72 min-w-0 overflow-hidden rounded-2xl border border-black/10 bg-black/[0.03] text-left transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--accent))] lg:block dark:border-white/15 dark:bg-white/5">
    {item.preview && url && depth !== null && canRenderWebsitePreview(depth) ? <iframe src={url} title="" tabIndex={-1} aria-hidden="true" width="1280" height="800"
      className="pointer-events-none absolute left-0 top-0 origin-top-left scale-[.28] border-0" /> : null}
    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pt-12 text-sm font-semibold text-white">{item.name}</span>
  </button>;
}

function WebsiteGallery({ locale, sites }: { locale: Locale; sites: ShowcaseWebsite[] }) {
  const copy = getCopy(locale);
  const [selectedId, setSelectedId] = useState(sites[0]?.id);
  const [mobile, setMobile] = useState(false);
  const [depth, setDepth] = useState<number | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setDepth(ancestorDepth());
    setOrigin(personalPreviewOrigin(window.location.hostname, window.location.origin));
  }, []);
  const index = Math.max(0, sites.findIndex(site => site.id === selectedId));
  const selected = sites[index];
  if (!selected) return null;
  const previewUrl = websitePreviewUrl(selected, locale, origin);
  const visitUrl = websitePreviewUrl(selected, locale);
  const hasNeighbors = sites.length > 1;
  return <section aria-label={copy.work.websitesTab} className="mt-8 min-w-0">
    <div className={`grid min-w-0 items-center gap-4 ${hasNeighbors ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)_minmax(0,1fr)]" : ""}`}>
      {hasNeighbors && <SitePeek item={sites[(index - 1 + sites.length) % sites.length]} locale={locale} origin={origin} depth={depth}
        onSelect={() => setSelectedId(sites[(index - 1 + sites.length) % sites.length].id)} />}
      <div key={selected.id} className="website-gallery-card min-w-0 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_24px_70px_-40px_rgba(0,0,0,.5)] dark:border-white/15 dark:bg-black">
        {selected.preview && previewUrl && depth !== null && canRenderWebsitePreview(depth)
          ? <ResponsivePreview url={previewUrl} title={copy.websites.previewTitle(selected.name)} mobile={mobile}
              sandbox={new URL(previewUrl).origin === window.location.origin ? undefined : "allow-scripts allow-same-origin allow-forms allow-popups"} />
          : <div className="flex min-h-80 items-center justify-center p-8 text-center text-sm text-black/60 dark:text-white/60">
              {selected.preview && depth === null ? copy.websites.loading
                : selected.preview ? copy.websites.depthLimit : copy.websites.linkOnly}
            </div>}
      </div>
      {hasNeighbors && <SitePeek item={sites[(index + 1) % sites.length]} locale={locale} origin={origin} depth={depth}
        onSelect={() => setSelectedId(sites[(index + 1) % sites.length].id)} />}
    </div>
    <div role="group" aria-label={copy.work.selectorLabel} className="mt-5 flex justify-center gap-2">
      {sites.map(site => <button key={site.id} type="button" onClick={() => setSelectedId(site.id)}
        aria-label={copy.websites.selectSite(site.name)} aria-current={site.id === selected.id ? "true" : undefined}
        className={`size-3 rounded-full border border-[hsl(var(--accent))] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--accent))] ${site.id === selected.id ? "scale-110 bg-[hsl(var(--accent))]" : "bg-transparent hover:bg-[hsl(var(--accent)/0.25)]"}`} />)}
    </div>
    <div className="mx-auto mt-5 flex max-w-4xl flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-2xl font-semibold">{selected.name}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-black/65 dark:text-white/65">{selected.shortDescription || selected.description}</p></div>
      <div className="flex flex-wrap items-center gap-4">
        {selected.preview && <div role="group" aria-label={copy.work.previewSize} className="inline-flex rounded-lg border border-black/10 p-1 dark:border-white/15">
          {([{ value: false, label: copy.work.desktop, Icon: Monitor }, { value: true, label: copy.work.mobile, Icon: Smartphone }]).map(mode =>
            <button key={mode.label} type="button" onClick={() => setMobile(mode.value)} aria-pressed={mobile === mode.value}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${mobile === mode.value ? "bg-[hsl(var(--accent))] text-white" : "hover:bg-black/5 dark:hover:bg-white/5"}`}>
              <mode.Icon size={15} aria-hidden />{mode.label}</button>)}</div>}
        {visitUrl && <a href={visitUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4"><ExternalLink size={15} aria-hidden />{copy.work.visit}</a>}
        {selected.sourceUrl && <a href={selected.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4"><Github size={15} aria-hidden />{copy.work.source}</a>}
      </div>
    </div>
  </section>;
}

export function WorkShowcase({ locale, items, stackCatalog }: {
  locale: Locale; items: ShowcaseWebsite[]; stackCatalog: WebsiteStackState;
}) {
  const copy = getCopy(locale);
  const sites = items.filter(item => item.url);
  const repositories = items.filter(item => item.sourceUrl);
  const [tab, setTab] = useState<"websites" | "repositories">(sites.length ? "websites" : "repositories");
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("project");
    if (requested && items.some(item => (item.id === requested || item.name === requested) && !item.url))
      setTab("repositories");
  }, [items]);
  return <>
    {sites.length > 0 && <div role="tablist" aria-label={copy.projects.title}
      className="mt-8 inline-flex rounded-full border border-black/10 bg-black/[0.04] p-1 dark:border-white/15 dark:bg-white/5">
      {([{ value: "websites", label: copy.work.websitesTab }, { value: "repositories", label: copy.work.repositoriesTab }] as const).map(option =>
        <button key={option.value} type="button" role="tab" id={`work-tab-${option.value}`}
          aria-controls={`work-panel-${option.value}`} aria-selected={tab === option.value}
          onClick={() => setTab(option.value)}
          className={`min-w-32 rounded-full px-5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--accent))] ${tab === option.value ? "bg-white shadow-sm dark:bg-zinc-800" : "text-black/65 hover:text-black dark:text-white/65 dark:hover:text-white"}`}>
          {option.label}</button>)}
    </div>}
    {tab === "websites" && sites.length > 0
      ? <div role="tabpanel" id="work-panel-websites" aria-labelledby="work-tab-websites"><WebsiteGallery locale={locale} sites={sites} /></div>
      : <div role="tabpanel" id="work-panel-repositories" aria-labelledby={sites.length ? "work-tab-repositories" : undefined}>
          <WorkExplorer locale={locale} items={repositories} stackCatalog={stackCatalog} embedWebsites={false} />
        </div>}
  </>;
}
