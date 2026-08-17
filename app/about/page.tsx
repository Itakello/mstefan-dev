import { Prose } from "@/components/Prose";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
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
  );
}
