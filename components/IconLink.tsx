import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

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
        className="group inline-flex items-center gap-2 rounded-xl border px-4 md:px-3.5 py-2 no-underline border-black/10 bg-black/[0.03] hover:border-accent hover:bg-black/5 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
      >
        <span className="opacity-80 group-hover:opacity-100">{icon}</span>
        <span className="font-medium">{label}</span>
        <ArrowUpRight className="size-4 opacity-60 group-hover:opacity-100" />
      </a>
    );
  }
  return (
    <Link
      href={href as any}
      className="group inline-flex items-center gap-2 rounded-xl border px-4 md:px-3.5 py-2 no-underline border-black/10 bg-black/[0.03] hover:border-accent hover:bg-black/5 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
    >
      <span className="opacity-80 group-hover:opacity-100">{icon}</span>
      <span className="font-medium">{label}</span>
      <ArrowUpRight className="size-4 opacity-60 group-hover:opacity-100" />
    </Link>
  );
}
