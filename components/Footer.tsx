"use client";

import { IconLink } from "@/components/IconLink";
import { Github, Linkedin } from "lucide-react";
import { SiX } from "react-icons/si";
import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  return (
    <footer className="py-10 text-xs text-black/60 dark:text-white/60">
      <div className="border-t border-black/10 dark:border-white/10 pt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Massimo Stefan. All rights reserved.</p>
        {pathname !== "/contact" && (
          <div className="flex flex-wrap gap-2">
            <IconLink
              href="https://github.com/Itakello"
              label="GitHub"
              icon={<Github className="size-4" />}
            />
            <IconLink
              href="https://www.linkedin.com/in/itakello/"
              label="LinkedIn"
              icon={<Linkedin className="size-4" />}
            />
            <IconLink
              href="https://x.com/itakello"
              label="X"
              icon={<SiX className="size-4" />}
            />
          </div>
        )}
      </div>
    </footer>
  );
}
