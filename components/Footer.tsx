"use client";

import { IconLink } from "@/components/IconLink";
import { Icon } from "@iconify/react";
import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  return (
    <footer className="py-10 text-xs text-black/60 dark:text-white/60">
      <div className="border-t border-black/10 dark:border-white/10 pt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p>© {new Date().getFullYear()} Massimo Stefan. All rights reserved.</p>
        {pathname !== "/contact" && (
          <div className="flex flex-wrap gap-2">
            <IconLink
              href="mailto:massimo@mstefan.dev"
              label="Email"
              icon={<Icon icon="logos:mailgun-icon" className="size-4" />}
            />
            <IconLink
              href="https://github.com/Itakello"
              label="GitHub"
              icon={<Icon icon="logos:github-icon" className="size-4" />}
            />
            <IconLink
              href="https://www.linkedin.com/in/itakello/"
              label="LinkedIn"
              icon={<Icon icon="logos:linkedin-icon" className="size-4" />}
            />
            <IconLink
              href="https://x.com/itakello"
              label="X"
              icon={<Icon icon="logos:x" className="size-4" />}
            />
          </div>
        )}
      </div>
    </footer>
  );
}
