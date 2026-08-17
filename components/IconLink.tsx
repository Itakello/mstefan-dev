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
        className="group inline-flex size-10 items-center justify-center text-black/65 no-underline transition-colors hover:text-black dark:text-white/65 dark:hover:text-white sm:h-10 sm:w-auto sm:gap-2 sm:px-2"
      >
        <span className="opacity-80 group-hover:opacity-100">{icon}</span>
        <span className="sr-only font-medium sm:not-sr-only">{label}</span>
      </a>
    );
  }
  return (
    <Link
      href={href as any}
      className="group inline-flex size-10 items-center justify-center text-black/65 no-underline transition-colors hover:text-black dark:text-white/65 dark:hover:text-white sm:h-10 sm:w-auto sm:gap-2 sm:px-2"
    >
      <span className="opacity-80 group-hover:opacity-100">{icon}</span>
      <span className="sr-only font-medium sm:not-sr-only">{label}</span>
    </Link>
  );
}
