"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Moon, Sun, X } from "lucide-react";
import { LanguageSelector } from "@/components/LanguageSelector";
import { getCopy, publicPagePaths, type PublicPage } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";

const pages: PublicPage[] = ["home", "projects", "about"];

export function Header({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const copy = getCopy(locale);
  const [isDark, setIsDark] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    const prefersDark = typeof window !== "undefined" && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = stored ? stored === "dark" : prefersDark;
    setIsDark(shouldBeDark);
    document.documentElement.classList.toggle("dark", shouldBeDark);
  }, []);

  function toggleTheme() {
    const nextDark = !isDark;
    setIsDark(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
    localStorage.setItem("theme", nextDark ? "dark" : "light");
  }
  const links = pages.map((page) => ({ href: localizedPath(locale, publicPagePaths[page]), label: copy.nav[page] }));

  return (
    <header className="relative flex items-center justify-between pt-8">
      <Link href={localizedPath(locale, "/")} aria-label={copy.header.homeLabel} className="group min-w-0 no-underline">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative size-11 overflow-hidden rounded-xl">
            <Image
              src="/profile-photo.jpg"
              alt={copy.header.portraitAlt}
              width={1530}
              height={2054}
              className="absolute left-1/2 top-[-2px] h-auto w-[88px] max-w-none -translate-x-1/2"
              priority
              unoptimized
            />
          </div>
          <div className="truncate font-semibold tracking-tight max-sm:hidden">Massimo Stefan</div>
        </div>
      </Link>
      <nav className="hidden items-center gap-6 text-sm sm:flex">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "hover:text-[hsl(var(--accent))] transition-colors",
              pathname === link.href && "text-[hsl(var(--accent))]"
            )}
          >
            {link.label}
          </Link>
        ))}
        <LanguageSelector locale={locale} />
        <button
          type="button"
          aria-label={copy.header.themeToggle}
          onClick={toggleTheme}
          className="rounded-md p-2 border border-black/10 hover:border-black/20 dark:border-white/10 dark:hover:border-white/20 transition-colors"
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </nav>
      <div className="flex items-center gap-2 sm:hidden">
        <LanguageSelector locale={locale} compact />
        <button
          type="button"
          aria-label={copy.header.themeToggle}
          onClick={toggleTheme}
          className="grid size-9 place-items-center rounded-md border border-black/10 dark:border-white/10"
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <button
          type="button"
          aria-label={menuOpen ? copy.header.closeNavigation : copy.header.openNavigation}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="grid size-9 place-items-center rounded-md border border-black/10 dark:border-white/10"
        >
          {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>
      {menuOpen && (
        <nav className="absolute right-0 top-[4.75rem] z-20 grid min-w-44 gap-1 rounded-xl border border-black/10 bg-white p-2 text-sm shadow-soft dark:border-white/10 dark:bg-black dark:shadow-softDark sm:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                "rounded-md px-3 py-2 no-underline transition-colors hover:bg-black/5 dark:hover:bg-white/10",
                pathname === link.href && "text-[hsl(var(--accent))]",
              )}
            >
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={toggleTheme}
            className="mt-1 flex items-center gap-2 rounded-md border-t border-black/10 px-3 py-2 text-left dark:border-white/10"
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span>{isDark ? copy.header.lightMode : copy.header.darkMode}</span>
          </button>
        </nav>
      )}
    </header>
  );
}
