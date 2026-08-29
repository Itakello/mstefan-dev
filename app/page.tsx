import Link from "next/link";
import { projects } from "@/content/projects";
import { ProjectCard } from "@/components/ProjectCard";

export default function Home() {
  const featured = projects.filter(p => p.featured).slice(0, 3);
  return (
    <section className="space-y-10">
      <header className="pt-4">
        <p className="text-sm text-black/60 dark:text-white/60">Massimo Stefan — AI Engineer</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          I build practical LLM systems, agents, and clean infra.
        </h1>
        <p className="mt-4 max-w-prose text-black/70 dark:text-white/70">
          Pragmatic over perfect. I ship fast, keep quality high, and avoid overengineering. Based in Europe.
        </p>
        {/* Availability chips moved to About page */}
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
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 bg-black/5 dark:bg-white/5">
            <div className="text-sm font-medium">Agents</div>
            <div className="mt-1 text-sm text-black/70 dark:text-white/70">reasoning, tool use, safe execution</div>
          </div>
          <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 bg-black/5 dark:bg-white/5">
            <div className="text-sm font-medium">Infra</div>
            <div className="mt-1 text-sm text-black/70 dark:text-white/70">solid services, simple blocks, low ops</div>
          </div>
          <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 bg-black/5 dark:bg-white/5">
            <div className="text-sm font-medium">Delivery</div>
            <div className="mt-1 text-sm text-black/70 dark:text-white/70">fast loops, measurable outcomes</div>
          </div>
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
