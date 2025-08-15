"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" }
] as const;

export function Header() {
  const pathname = usePathname();
  const [isDark, setIsDark] = useState<boolean>(false);

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
    <header className="flex items-center justify-between pt-8">
      <Link href="/" className="group">
        <div className="flex items-center gap-3">
          <Image
            src="/profile-pic.jpg"
            alt="Portrait of Massimo Stefan"
            width={32}
            height={32}
            className="rounded-xl object-cover"
            priority
          />
          <div className="font-semibold tracking-tight">Massimo Stefan</div>
        </div>
      </Link>
      <nav className="flex items-center gap-6 text-sm">
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
    </header>
  );
}
