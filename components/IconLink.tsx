import Link from "next/link";
import { ICON_LINK_COLOR_CLASS } from "@/lib/iconStyles";

export function IconLink({
  href,
  label,
  icon
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  const isExternal = /^(https?:|mailto:|tel:)/.test(href);
  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex size-10 items-center justify-center rounded-md border border-black/10 bg-black/[0.025] no-underline hover:border-black/20 hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-white/20 dark:hover:bg-white/10 sm:h-10 sm:w-auto sm:gap-2 sm:px-2 ${ICON_LINK_COLOR_CLASS}`}
      >
        <span>{icon}</span>
        <span className="sr-only font-medium sm:not-sr-only">{label}</span>
      </a>
    );
  }
  return (
    <Link
      href={href as any}
      className={`inline-flex size-10 items-center justify-center rounded-md border border-black/10 bg-black/[0.025] no-underline hover:border-black/20 hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-white/20 dark:hover:bg-white/10 sm:h-10 sm:w-auto sm:gap-2 sm:px-2 ${ICON_LINK_COLOR_CLASS}`}
    >
      <span>{icon}</span>
      <span className="sr-only font-medium sm:not-sr-only">{label}</span>
    </Link>
  );
}
