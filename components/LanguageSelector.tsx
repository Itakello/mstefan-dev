"use client";

import { Check, ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { getCopy, type PublicPath } from "@/lib/i18n/copy";
import { type Locale } from "@/lib/i18n/config";
import { getPublicPathname, localizedPath } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";

function Flag({ locale }: { locale: Locale }) {
  if (locale === "it") {
    return (
      <svg viewBox="0 0 12 9" aria-hidden="true" className="h-[15px] w-5 shrink-0 rounded-[1px] shadow-sm">
        <path fill="#009246" d="M0 0h4v9H0z" />
        <path fill="#fff" d="M4 0h4v9H4z" />
        <path fill="#ce2b37" d="M8 0h4v9H8z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 12 9" aria-hidden="true" className="h-[15px] w-5 shrink-0 rounded-[1px] shadow-sm">
      <path fill="#012169" d="M0 0h12v9H0z" />
      <path stroke="#fff" strokeWidth="1.7" d="m0 0 12 9M12 0 0 9" />
      <path stroke="#c8102e" strokeWidth="0.7" d="m0 0 12 9M12 0 0 9" />
      <path stroke="#fff" strokeWidth="2.8" d="M6 0v9M0 4.5h12" />
      <path stroke="#c8102e" strokeWidth="1.3" d="M6 0v9M0 4.5h12" />
    </svg>
  );
}

export function LanguageSelector({ locale, compact = false }: { locale: Locale; compact?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const copy = getCopy(locale);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!selectorRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function selectLocale(nextLocale: Locale) {
    const publicPath: PublicPath = getPublicPathname(pathname ?? "/") ?? "/";
    const query = window.location.search;
    document.cookie = `site-locale=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.location.assign(`${localizedPath(nextLocale, publicPath)}${query}`);
  }

  return (
    <div ref={selectorRef} className="relative">
      <button
        type="button"
        aria-label={copy.language.select}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-black/10 px-2 py-1.5 text-sm transition-colors hover:border-black/20 dark:border-white/10 dark:hover:border-white/20",
          compact && "gap-1.5 px-1.5",
        )}
      >
        <Flag locale={locale} />
        <span className={cn(compact && "sr-only")}>{copy.language[locale === "en" ? "English" : "Italiano"]}</span>
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={copy.language.label}
          className="absolute right-0 top-full z-30 mt-2 min-w-36 rounded-lg border border-black/10 bg-white p-1 shadow-soft dark:border-white/10 dark:bg-black dark:shadow-softDark"
        >
          {(["en", "it"] as const).map((optionLocale) => (
            <button
              key={optionLocale}
              type="button"
              role="menuitemradio"
              aria-checked={locale === optionLocale}
              onClick={() => selectLocale(optionLocale)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm no-underline transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            >
              <Flag locale={optionLocale} />
              <span className="flex-1">{copy.language[optionLocale === "en" ? "English" : "Italiano"]}</span>
              {locale === optionLocale && <Check className="size-4" aria-label={copy.language.selected} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
