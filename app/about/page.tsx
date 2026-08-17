import Image from "next/image";

import { Prose } from "@/components/Prose";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <section className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] md:items-start md:gap-12">
      <Prose>
        <h1>About</h1>
        <p>
          I’m Massimo Stefan, a software engineer based in Italy. I build agents and
          automation that connect models to the tools and information people already use.
        </p>
        <p>
          I prefer systems with one source of truth, deterministic automation where
          possible, human approval where it matters, and failures that are visible instead
          of silent. The point is not to add AI everywhere. It is to remove work without
          losing control.
        </p>
      </Prose>

      <figure className="w-full max-w-sm justify-self-center overflow-hidden rounded-2xl border border-black/10 bg-black/[0.03] md:justify-self-end dark:border-white/10 dark:bg-white/5">
        <Image
          src="/profile-photo-full.png"
          alt="Massimo Stefan standing in an elevator, holding a laptop"
          width={764}
          height={1146}
          unoptimized
          className="h-auto w-full"
        />
      </figure>
    </section>
  );
}
