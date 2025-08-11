import { Prose } from "@/components/Prose";

export const metadata = { title: "About" };

export default function AboutPage() {
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
    </Prose>
  );
}


