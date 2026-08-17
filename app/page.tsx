import Link from "next/link";

export default function Home() {
  return (
    <section className="space-y-10">
      <header className="pt-4">
        <p className="text-sm text-black/60 dark:text-white/60">
          Software engineer · AI systems
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          I build AI systems for real work.
        </h1>
        <p className="mt-4 max-w-prose text-black/70 dark:text-white/70">
          I’m interested in the layer between a capable model and a useful outcome:
          tools, state, permissions, evaluation, and the feedback loops that make the
          system dependable.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/projects"
            className="rounded-xl bg-[hsl(var(--accent))] px-4 py-2 font-medium text-black no-underline hover:opacity-90"
          >
            See projects
          </Link>
          <Link
            href="/contact"
            className="rounded-xl border px-4 py-2 font-medium no-underline border-black/15 hover:border-accent dark:border-white/15"
          >
            Get in touch
          </Link>
        </div>
      </header>
    </section>
  );
}
