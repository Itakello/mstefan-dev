import Link from "next/link";

import { getCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

export function WorkViewSwitcher({ locale, current }: { locale: Locale; current: "projects" | "websites" }) {
  const copy = getCopy(locale).work;

  return (
    <nav aria-label={copy.selectorLabel} className="mt-7 flex w-fit rounded-full border border-black/10 bg-black/[0.04] p-1 dark:border-white/15 dark:bg-white/[0.07]">
      {(["projects", "websites"] as const).map((view) => (
        <Link
          key={view}
          href={localizedPath(locale, view === "projects" ? "/projects" : "/websites")}
          aria-current={current === view ? "page" : undefined}
          className={`min-w-32 rounded-full px-6 py-2.5 text-center text-sm font-medium no-underline transition-colors sm:min-w-40 ${
            current === view
              ? "bg-white text-black shadow-sm dark:bg-white dark:text-black"
              : "text-black/65 hover:text-black dark:text-white/65 dark:hover:text-white"
          }`}
        >
          {copy[view]}
        </Link>
      ))}
    </nav>
  );
}
