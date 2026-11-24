import Link from "next/link";
import { getCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import type { ShowcaseWebsite } from "@/lib/websiteShowcase";

/** Project cards that open the matching project in Work. */
export function FeaturedWork({ items, locale }: { items: ShowcaseWebsite[]; locale: Locale }) {
  const copy = getCopy(locale);
  return (
    <ul className="mt-4 grid gap-4 sm:grid-cols-2">
      {items.map((item) => {
        const image = item.previewImages?.[0]?.url ?? item.screenshotPages?.[0]?.screenshots.desktop;
        return (
          <li key={item.id} className="min-w-0">
            <Link href={`${localizedPath(locale, "/projects")}?project=${encodeURIComponent(item.name)}`} data-featured-work
              className="card group flex h-full flex-col overflow-hidden no-underline transition-colors hover:border-[hsl(var(--accent)/0.5)]">
              {image && <span className="m-2 mb-0 flex aspect-[16/10] items-center justify-center overflow-hidden rounded-xl bg-[var(--page-bg)]">
                <img src={image} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
              </span>}
              <span className="flex flex-1 flex-col gap-1 p-4">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold [overflow-wrap:anywhere]">{item.name}</span>
                  {item.type && <span className="work-category" data-category={item.type}>{copy.work.types[item.type]}</span>}
                  {item.year && <span className="ml-auto font-mono text-xs text-[var(--page-muted)]">{item.year}</span>}
                </span>
                <span className="line-clamp-2 text-sm text-[var(--page-muted)]">{item.shortDescription || item.description}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
