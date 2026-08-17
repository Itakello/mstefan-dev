import Link from "next/link";

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
        className="group inline-flex size-10 items-center justify-center rounded-md border border-black/10 bg-black/[0.025] text-black/65 no-underline transition-colors hover:border-black/20 hover:bg-black/5 hover:text-black dark:border-white/10 dark:bg-white/[0.035] dark:text-white/65 dark:hover:border-white/20 dark:hover:bg-white/10 dark:hover:text-white sm:h-10 sm:w-auto sm:gap-2 sm:px-2"
      >
        <span className="opacity-80 group-hover:opacity-100">{icon}</span>
        <span className="sr-only font-medium sm:not-sr-only">{label}</span>
      </a>
    );
  }
  return (
    <Link
      href={href as any}
      className="group inline-flex size-10 items-center justify-center rounded-md border border-black/10 bg-black/[0.025] text-black/65 no-underline transition-colors hover:border-black/20 hover:bg-black/5 hover:text-black dark:border-white/10 dark:bg-white/[0.035] dark:text-white/65 dark:hover:border-white/20 dark:hover:bg-white/10 dark:hover:text-white sm:h-10 sm:w-auto sm:gap-2 sm:px-2"
    >
      <span className="opacity-80 group-hover:opacity-100">{icon}</span>
      <span className="sr-only font-medium sm:not-sr-only">{label}</span>
    </Link>
  );
}
