"use client";

import { IconLink } from "@/components/IconLink";
import { Icon } from "@iconify/react";

export function Footer() {
  return (
    <footer className="py-10 text-xs text-black/60 dark:text-white/60">
      <div className="border-t border-black/10 dark:border-white/10 pt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="md:flex-1 md:truncate">© {new Date().getFullYear()} Massimo Stefan. All rights reserved.</p>
        <div className="flex flex-wrap gap-2 md:flex-nowrap md:shrink-0">
          <IconLink
            href="mailto:massimo@mstefan.dev"
            label="Email"
            icon={<Icon icon="lucide:mail" className="size-4" aria-hidden />}
          />
          <IconLink
            href="https://github.com/Itakello"
            label="GitHub"
            icon={<Icon icon="skill-icons:github-dark" className="size-4" aria-hidden />}
          />
          <IconLink
            href="https://www.linkedin.com/in/itakello/"
            label="LinkedIn"
            icon={<Icon icon="skill-icons:linkedin" className="size-4" aria-hidden />}
          />
          <IconLink
            href="https://x.com/itakello"
            label="X"
            icon={<Icon icon="simple-icons:x" className="size-4 text-black dark:text-white" aria-hidden />}
          />
        </div>
      </div>
    </footer>
  );
}
