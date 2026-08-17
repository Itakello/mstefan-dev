"use client";

import { Check, ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { getCopy, type PublicPath } from "@/lib/i18n/copy";
import { type Locale } from "@/lib/i18n/config";
import { getLanguageMenuFocusIndex, shouldCloseLanguageMenuOnFocusLeave } from "@/lib/i18n/languageMenu";
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
      <path fill="#fff" d="M0 0h1.8l10.2 7.65V9H10.2L0 1.35zm12 0v1.35L1.8 9H0V7.65L10.2 0z" />
      <path fill="#c8102e" d="M0 0h1.05L12 8.2V9h-1.05L0 .8zm12 0v.8L1.05 9H0v-.8L10.95 0z" />
      <path fill="#fff" d="M4.2 0h3.6v2.7H12v3.6H7.8V9H4.2V6.3H0V2.7h4.2z" />
      <path fill="#c8102e" d="M4.95 0h2.1v3.45H12v2.1H7.05V9h-2.1V5.55H0v-2.1h4.95z" />
    </svg>
  );
}

const localeOptions: Locale[] = ["en", "it"];

export function LanguageSelector({ locale, compact = false }: { locale: Locale; compact?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => localeOptions.indexOf(locale));
  const selectorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const copy = getCopy(locale);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!selectorRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => menuItemRefs.current[activeIndex]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, open]);

  function openMenu(index = localeOptions.indexOf(locale)) {
    setActiveIndex(index);
    setOpen(true);
  }

  function closeMenuAndRestoreFocus() {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function selectLocale(nextLocale: Locale) {
    const publicPath: PublicPath = getPublicPathname(pathname ?? "/") ?? "/";
    const query = window.location.search;
    document.cookie = `site-locale=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.location.assign(`${localizedPath(nextLocale, publicPath)}${query}`);
  }

  function handleMenuItemKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenuAndRestoreFocus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectLocale(localeOptions[index]);
      return;
    }

    const nextIndex = getLanguageMenuFocusIndex(index, event.key, localeOptions.length);
    if (nextIndex === null) return;
    event.preventDefault();
    setActiveIndex(nextIndex);
  }

  return (
    <div
      ref={selectorRef}
      className="relative"
      onBlur={(event) => {
        const nextFocusIsWithinSelector = event.relatedTarget instanceof Node
          && event.currentTarget.contains(event.relatedTarget);
        if (open && shouldCloseLanguageMenuOnFocusLeave(nextFocusIsWithinSelector)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={copy.language.select}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu();
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          openMenu(event.key === "ArrowDown" ? 0 : localeOptions.length - 1);
        }}
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
          {localeOptions.map((optionLocale, index) => (
            <button
              key={optionLocale}
              ref={(element) => { menuItemRefs.current[index] = element; }}
              type="button"
              role="menuitemradio"
              aria-checked={locale === optionLocale}
              onClick={() => selectLocale(optionLocale)}
              onKeyDown={(event) => handleMenuItemKeyDown(event, index)}
              tabIndex={activeIndex === index ? 0 : -1}
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
