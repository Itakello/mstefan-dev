"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, Moon, Sun, X } from "lucide-react";
import { LanguageSelector } from "@/components/LanguageSelector";
import { getCopy, publicPagePaths, type PublicPage } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import clsx from "clsx";

const pages: PublicPage[] = ["home", "projects", "about"];

export function Header({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const copy = getCopy(locale);
  const [isDark, setIsDark] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [menuOpen]);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    setReady(true);
  }, []);

  function toggleTheme() {
    const nextDark = !document.documentElement.classList.contains("dark");
    setIsDark(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
    document.querySelector('link[rel="icon"]')?.setAttribute("href", nextDark ? "/icon.png" : "/icon-light.png");
    try {
      localStorage.setItem("theme", nextDark ? "dark" : "light");
    } catch {}
  }
  const links = pages.map((page) => ({ href: localizedPath(locale, publicPagePaths[page]), label: copy.nav[page] }));

  return (
    <header ref={headerRef} onKeyDown={(event) => {
      if (event.key === "Escape" && menuOpen) {
        event.preventDefault();
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }} className="relative flex items-center justify-between pt-8">
      <Link href={localizedPath(locale, "/")} aria-label={copy.header.homeLabel} onClick={() => setMenuOpen(false)} className="group min-w-0 no-underline">
        <div className="flex min-w-0 items-center gap-3">
          <Image src="/icon-light.png" alt="" width={44} height={44} className="header-logo-image size-11 shrink-0 dark:hidden" priority unoptimized />
          <Image src="/icon.png" alt="" width={44} height={44} className="header-logo-image hidden size-11 shrink-0 dark:block" priority unoptimized />
          <span aria-hidden="true" className="header-mark-forced hidden size-11 shrink-0" />
          <div className="truncate font-semibold tracking-tight">Massimo Stefan</div>
        </div>
      </Link>
      <nav className="ml-auto mr-6 hidden items-center gap-6 text-sm sm:flex">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setMenuOpen(false)}
            className={clsx(
              "hover:text-[hsl(var(--accent))] transition-colors",
              pathname === link.href && "text-[hsl(var(--accent))]"
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center">
        <button
          type="button"
          ref={menuButtonRef}
          disabled={!ready}
          aria-label={menuOpen ? copy.header.closeNavigation : copy.header.openNavigation}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="grid size-9 place-items-center rounded-md border border-black/10 dark:border-white/10"
        >
          {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>
      {menuOpen && (
        <nav className="absolute right-0 top-[4.75rem] z-20 grid min-w-44 gap-1 rounded-xl border border-black/10 bg-[var(--page-bg)] p-2 text-sm shadow-soft dark:border-white/10 dark:shadow-softDark">
          <div className="grid gap-1 sm:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={clsx(
                "rounded-md px-3 py-2 no-underline transition-colors hover:bg-black/5 dark:hover:bg-white/10",
                pathname === link.href && "text-[hsl(var(--accent))]",
              )}
            >
              {link.label}
            </Link>
          ))}
          </div>
          <div className="border-black/10 max-sm:mt-1 max-sm:border-t max-sm:pt-2 dark:border-white/10">
            <LanguageSelector locale={locale} />
          </div>
          <button
            type="button"
            aria-label={copy.header.themeToggle}
            onClick={toggleTheme}
            className="mt-1 flex items-center gap-2 rounded-md border-t border-black/10 px-3 py-2 text-left transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span>{isDark ? copy.header.lightMode : copy.header.darkMode}</span>
          </button>
        </nav>
      )}
    </header>
  );
}
