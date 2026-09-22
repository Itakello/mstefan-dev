"use client";

import { ExternalLink, Globe2 } from "lucide-react";
import { useEffect, useState } from "react";

import { getCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/config";
import {
  canRenderWebsitePreview,
  personalPreviewOrigin,
  showcaseWebsites,
  type ShowcaseWebsite,
  websitePreviewUrl,
} from "@/lib/websiteShowcase";

function sameOriginAncestorDepth() {
  let current: Window = window;
  let depth = 0;

  while (current.parent !== current) {
    const parent = current.parent;
    try {
      if (parent.location.origin !== current.location.origin) break;
      depth += 1;
      current = parent;
    } catch {
      break;
    }
  }

  return depth;
}

export function WebsiteShowcase({ locale }: { locale: Locale }) {
  const copy = getCopy(locale).websites;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [ancestorDepth, setAncestorDepth] = useState<number | null>(null);
  const [personalSiteOrigin, setPersonalSiteOrigin] = useState<string>(showcaseWebsites[0].url);
  const selected = showcaseWebsites[selectedIndex];
  const selectedCopy = copy.entries[selected.id];
  const previewUrl = websitePreviewUrl(selected, locale, personalSiteOrigin);
  const fullSiteUrl = websitePreviewUrl(selected, locale);

  useEffect(() => {
    setAncestorDepth(sameOriginAncestorDepth());
    setPersonalSiteOrigin(personalPreviewOrigin(window.location.hostname, window.location.origin));
  }, []);

  function peek(website: ShowcaseWebsite, index: number) {
    return (
      <button
        key={website.id}
        type="button"
        onClick={() => setSelectedIndex(index)}
        aria-label={copy.selectSite(copy.entries[website.id].name)}
        className="group hidden h-64 min-w-0 rounded-2xl border border-black/10 bg-black/[0.03] p-5 text-left transition-colors hover:border-[hsl(var(--accent))] dark:border-white/15 dark:bg-white/[0.05] md:flex md:flex-col md:justify-end"
      >
        <Globe2 className="mb-auto size-6 text-[hsl(var(--accent))]" aria-hidden="true" />
        <span className="text-lg font-semibold leading-tight tracking-tight">{copy.entries[website.id].name}</span>
        <span className="mt-2 line-clamp-3 text-xs leading-5 text-black/60 dark:text-white/60">
          {copy.entries[website.id].description}
        </span>
      </button>
    );
  }

  return (
    <div className="mt-8">
      <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,4fr)_minmax(0,1fr)]">
        {selectedIndex > 0 ? peek(showcaseWebsites[selectedIndex - 1], selectedIndex - 1) : <div aria-hidden="true" />}

        <div className="min-w-0 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-soft dark:border-white/15 dark:bg-black dark:shadow-softDark">
          <div className="flex min-w-0 items-center gap-3 border-b border-black/10 bg-black/[0.03] px-4 py-3 dark:border-white/10 dark:bg-white/[0.05]">
            <div className="hidden gap-1.5 sm:flex" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-red-400" />
              <span className="size-2.5 rounded-full bg-amber-400" />
              <span className="size-2.5 rounded-full bg-emerald-400" />
            </div>
            <span className="min-w-0 flex-1 truncate rounded-md border border-black/10 bg-white px-3 py-1.5 text-xs text-black/60 dark:border-white/10 dark:bg-black dark:text-white/60">
              {previewUrl}
            </span>
            <a
              href={fullSiteUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={copy.openSite(selectedCopy.name)}
              className="grid size-8 shrink-0 place-items-center rounded-md border border-black/10 no-underline transition-colors hover:border-black/25 dark:border-white/10 dark:hover:border-white/25"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </div>

          {!selected.preview ? (
            <div className="flex h-[min(66vh,620px)] min-h-96 flex-col items-center justify-center bg-[#f1eee8] p-8 text-center text-[#29211c] dark:bg-[#e9e3d8]">
              <span className="text-xs font-semibold uppercase tracking-[0.25em]">{copy.entries[selected.id].name}</span>
              <h2 className="mt-5 max-w-xl font-serif text-5xl leading-tight sm:text-7xl">{copy.entries[selected.id].name}</h2>
              <p className="mt-5 max-w-md text-sm leading-6 text-[#5e5147]">{copy.linkOnly}</p>
              <a className="mt-6 inline-flex items-center gap-2 font-semibold" href={fullSiteUrl} target="_blank" rel="noreferrer">
                {copy.openSite(selectedCopy.name)}
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            </div>
          ) : ancestorDepth === null ? (
            <div className="grid h-[min(66vh,620px)] min-h-96 place-items-center text-sm text-black/60 dark:text-white/60">
              {copy.loading}
            </div>
          ) : canRenderWebsitePreview(ancestorDepth) ? (
            <iframe
              key={previewUrl}
              src={previewUrl}
              title={copy.previewTitle(selectedCopy.name)}
              className="h-[min(66vh,620px)] min-h-96 w-full border-0 bg-white dark:bg-black"
              loading="eager"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="grid h-[min(66vh,620px)] min-h-96 place-items-center p-8 text-center">
              <div className="max-w-md">
                <Globe2 className="mx-auto size-8 text-[hsl(var(--accent))]" aria-hidden="true" />
                <p className="mt-4 text-sm text-black/70 dark:text-white/70">{copy.depthLimit}</p>
                <a className="mt-5 inline-flex items-center gap-2" href={fullSiteUrl} target="_blank" rel="noreferrer">
                  {copy.openSite(selectedCopy.name)}
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              </div>
            </div>
          )}
        </div>

        {selectedIndex < showcaseWebsites.length - 1 ? peek(showcaseWebsites[selectedIndex + 1], selectedIndex + 1) : <div aria-hidden="true" />}
      </div>

      <div role="group" aria-label={copy.selectorLabel} className="mt-5 flex justify-center gap-3">
        {showcaseWebsites.map((website, index) => (
          <button
            key={website.id}
            type="button"
            aria-label={copy.selectSite(copy.entries[website.id].name)}
            aria-current={selectedIndex === index ? "true" : undefined}
            onClick={() => setSelectedIndex(index)}
            className={`size-3 rounded-full border border-[hsl(var(--accent))] transition-transform hover:scale-125 ${
              selectedIndex === index ? "bg-[hsl(var(--accent))]" : "bg-transparent"
            }`}
          />
        ))}
      </div>

      {selected.preview && <p className="mt-4 text-center text-xs text-black/55 dark:text-white/55">{copy.previewHelp}</p>}
    </div>
  );
}
