import { Prose } from "@/components/Prose";
import { StackCatalog } from "@/components/StackCatalog";
import { loadWebsiteStack } from "@/lib/websiteStack";

export const metadata = { title: "About" };
export const revalidate = 60;

export default async function AboutPage() {
  const stackState = await loadWebsiteStack();
  const stack = stackState.entries.filter(
    (entry) => entry.websiteVisible
  );
  const stackMessage = stackState.message
    ?? (stack.length === 0 ? "No Stack items are currently approved for website publication." : null);

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
      <h2>Stack</h2>
      <p>Selected technologies I use across my work.</p>
      {stackMessage && (
        <p
          className="not-prose rounded-xl border border-black/10 bg-black/[0.03] p-4 text-sm text-black/70 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
          data-stack-publication-status={stackState.status === "ready" ? "empty" : stackState.status}
          role={stackState.status === "error" || stackState.status === "unconfigured" ? "alert" : "status"}
        >
          {stackMessage}
        </p>
      )}
      <StackCatalog entries={stack} />
    </Prose>
  );
}
