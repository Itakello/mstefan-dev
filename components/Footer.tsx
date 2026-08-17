"use client";

import { IconLink } from "@/components/IconLink";
import { Icon } from "@iconify/react";

export function Footer() {
  return (
    <footer className="py-10 text-xs text-black/60 dark:text-white/60">
      <div className="flex flex-col items-start gap-4 border-t border-black/10 pt-6 dark:border-white/10 min-[360px]:flex-row min-[360px]:items-center min-[360px]:justify-between min-[360px]:gap-2 md:items-center">
        <p className="relative shrink-0 after:absolute after:-right-1 after:top-1/2 after:hidden after:h-5 after:w-px after:-translate-y-1/2 after:bg-black/10 dark:after:bg-white/10 min-[360px]:after:block md:flex-1 md:truncate">
          <span className="whitespace-nowrap">© {new Date().getFullYear()} Massimo Stefan.</span>{" "}
          <span className="block whitespace-nowrap sm:inline">All rights reserved.</span>
        </p>
        <div className="flex flex-nowrap gap-1 sm:gap-2 md:shrink-0">
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
            icon={(
              <span className="grid size-4 place-items-center rounded-[3px] bg-black text-white">
                <Icon icon="ri:twitter-x-fill" className="size-[11px]" aria-hidden />
              </span>
            )}
          />
        </div>
      </div>
    </footer>
  );
}
