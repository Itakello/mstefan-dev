import Link from "next/link";
import { projects } from "@/content/projects";
import { ProjectCard } from "@/components/ProjectCard";

export default function Home() {
  const featured = projects.filter(p => p.featured).slice(0, 3);
  return (
    <section className="space-y-10">
      <header className="pt-4">
        <p className="text-sm text-black/60 dark:text-white/60">AI Engineer</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          I build practical LLM systems, agents, and clean infra.
        </h1>
        <p className="mt-4 max-w-prose text-black/70 dark:text-white/70">
          Pragmatic over perfect. I ship fast, keep quality high, and avoid overengineering.
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
            Hire me
          </Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {featured.map((p) => (
          <ProjectCard key={p.title} {...p} />
        ))}
      </div>
    </section>
  );
}
