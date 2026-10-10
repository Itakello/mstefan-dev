"use client";

import { IconLink } from "@/components/IconLink";
import { BrandIcon } from "@/components/BrandIcon";
import { BRAND_ICON_CLASS } from "@/lib/iconStyles";
import { getCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/config";
import { Icon } from "@iconify/react";

export function Footer({ locale }: { locale: Locale }) {
  const copy = getCopy(locale);
  return (
    <footer className="py-10 text-xs text-black/60 dark:text-white/60">
      <div className="flex flex-col items-start gap-4 border-t border-black/10 pt-6 dark:border-white/10 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between min-[400px]:gap-2 md:items-center">
        <p className="relative shrink-0 after:absolute after:-right-1 after:top-1/2 after:hidden after:h-5 after:w-px after:-translate-y-1/2 after:bg-black/10 dark:after:bg-white/10 min-[400px]:after:block md:flex-1 md:truncate">
          <span className="whitespace-nowrap">© {new Date().getFullYear()} Massimo Stefan.</span>{" "}
          <span className="block whitespace-nowrap sm:inline">{copy.footer.rights}</span>
        </p>
        <div className="flex flex-nowrap gap-1 sm:gap-2 md:shrink-0">
          <IconLink
            href="mailto:me@mstefan.dev"
            label="Email"
            icon={<Icon icon="lucide:mail" className={BRAND_ICON_CLASS} aria-hidden />}
          />
          <IconLink
            href="https://github.com/Itakello"
            label="GitHub"
            icon={<BrandIcon brand="github" />}
          />
          <IconLink
            href="https://www.linkedin.com/in/itakello/"
            label="LinkedIn"
            icon={<BrandIcon brand="linkedin" />}
          />
          <IconLink
            href="https://x.com/itakello"
            label="X"
            icon={<BrandIcon brand="x" />}
          />
        </div>
      </div>
    </footer>
  );
}
