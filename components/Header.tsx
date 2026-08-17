"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Moon, Sun, X } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Work" },
  { href: "/about", label: "About" }
] as const;

export function Header() {
  const pathname = usePathname();
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
  return (
    <header className="relative flex items-center justify-between pt-8">
      <Link href="/" aria-label="Massimo Stefan home" className="group no-underline">
        <div className="flex items-center gap-3">
          <Image
            src="/profile-avatar.jpg"
            alt="Portrait of Massimo Stefan"
            width={44}
            height={44}
            className="size-11 rounded-xl object-cover"
            priority
          />
          <div className="font-semibold tracking-tight">Massimo Stefan</div>
        </div>
      </Link>
      <nav className="hidden items-center gap-6 text-sm sm:flex">
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href as unknown as import("next").Route}
            className={cn(
              "hover:text-[hsl(var(--accent))] transition-colors",
              pathname === l.href && "text-[hsl(var(--accent))]"
            )}
          >
            {l.label}
          </Link>
        ))}
        <button
          type="button"
          aria-label="Toggle theme"
          onClick={toggleTheme}
          className="rounded-md p-2 border border-black/10 hover:border-black/20 dark:border-white/10 dark:hover:border-white/20 transition-colors"
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </nav>
      <button
        type="button"
        aria-label={menuOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        className="grid size-9 place-items-center rounded-md border border-black/10 sm:hidden dark:border-white/10"
      >
        {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>
      {menuOpen && (
        <nav className="absolute right-0 top-[4.75rem] z-20 grid min-w-44 gap-1 rounded-xl border border-black/10 bg-white p-2 text-sm shadow-soft dark:border-white/10 dark:bg-black dark:shadow-softDark sm:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href as unknown as import("next").Route}
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
            <span>{isDark ? "Light mode" : "Dark mode"}</span>
          </button>
        </nav>
      )}
    </header>
  );
}
