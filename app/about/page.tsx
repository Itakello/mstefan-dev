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
        I'm Massimo. I design and ship AI systems that are useful on day one.
        My focus is on reasoning models, agent scaffolding, and clean infra that stays maintainable.
      </p>
      <p>
        I prefer simple building blocks, fast iteration, and measurable outcomes.
        If a tool saves time without locking me in, I'm in.
      </p>
      <h2>Now</h2>
      <ul>
        <li>Exploring agentic workflows with OpenAI models</li>
        <li>Improving my resume tailoring pipeline</li>
        <li>Looking for roles in NL, UK, Nordics</li>
      </ul>
      <h2>Stack</h2>
      <p>Tools and technologies I use to build and ship projects.</p>
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
