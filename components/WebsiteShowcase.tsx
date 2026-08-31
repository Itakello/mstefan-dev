"use client";

import { ExternalLink, Globe2 } from "lucide-react";
import { useEffect, useState } from "react";

import { getCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/config";
import {
  canRenderWebsitePreview,
  showcaseWebsites,
  type ShowcaseWebsiteId,
  websitePreviewUrl,
} from "@/lib/websiteShowcase";
import { cn } from "@/lib/utils";

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
  const [selectedId, setSelectedId] = useState<ShowcaseWebsiteId>("mstefan");
  const [ancestorDepth, setAncestorDepth] = useState<number | null>(null);
  const [personalSiteOrigin, setPersonalSiteOrigin] = useState<string>(showcaseWebsites[0].url);
  const selected = showcaseWebsites.find((website) => website.id === selectedId) ?? showcaseWebsites[0];
  const selectedCopy = copy.entries[selected.id];
  const previewUrl = websitePreviewUrl(selected, locale, personalSiteOrigin);
  const fullSiteUrl = websitePreviewUrl(selected, locale);

  useEffect(() => {
    setAncestorDepth(sameOriginAncestorDepth());
    setPersonalSiteOrigin(window.location.origin);
  }, []);

  return (
    <div className="mt-8">
      <div aria-label={copy.selectorLabel} className="grid gap-3 sm:grid-cols-2" role="group">
        {showcaseWebsites.map((website) => {
          const entry = copy.entries[website.id];
          const selectedWebsite = website.id === selected.id;

          return (
            <button
              key={website.id}
              type="button"
              aria-pressed={selectedWebsite}
              onClick={() => setSelectedId(website.id)}
              className={cn(
                "rounded-2xl border p-4 text-left transition-colors",
                selectedWebsite
                  ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent)/0.08)]"
                  : "border-black/10 bg-black/[0.02] hover:border-black/25 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/25",
              )}
            >
              <span className="flex items-center gap-2 font-semibold">
                <Globe2 className="size-4" aria-hidden="true" />
                {entry.name}
              </span>
              <span className="mt-1 block text-sm text-black/65 dark:text-white/65">{entry.description}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-soft dark:border-white/10 dark:bg-black dark:shadow-softDark">
        <div className="flex min-w-0 items-center gap-3 border-b border-black/10 bg-black/[0.03] px-4 py-3 dark:border-white/10 dark:bg-white/[0.05]">
          <div className="hidden gap-1.5 sm:flex" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-red-400" />
            <span className="size-2.5 rounded-full bg-amber-400" />
            <span className="size-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className="min-w-0 flex-1 truncate rounded-md border border-black/10 bg-white px-3 py-1.5 text-xs text-black/60 dark:border-white/10 dark:bg-black dark:text-white/60">
            {previewUrl}
          </div>
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

        {ancestorDepth === null ? (
          <div className="grid h-[70vh] min-h-[34rem] place-items-center text-sm text-black/60 dark:text-white/60">
            {copy.loading}
          </div>
        ) : canRenderWebsitePreview(ancestorDepth) ? (
          <iframe
            key={previewUrl}
            src={previewUrl}
            title={copy.previewTitle(selectedCopy.name)}
            className="h-[70vh] min-h-[34rem] w-full border-0"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox={selected.id === "mstefan"
              ? undefined
              : "allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"}
          />
        ) : (
          <div className="grid h-[70vh] min-h-[34rem] place-items-center p-8 text-center">
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

      <p className="mt-3 text-xs text-black/55 dark:text-white/55">{copy.previewHelp}</p>
    </div>
  );
}
