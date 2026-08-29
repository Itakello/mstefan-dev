import { Prose } from "@/components/Prose";
import { Icon } from "@iconify/react";

export const metadata = { title: "About" };

export default function AboutPage() {
  type Skill = { label: string; light: string; dark: string; learning?: boolean };
  const categories: { title: string; skills: Skill[] }[] = [
    {
      title: "Core",
      skills: [
        { label: "Python", light: "skill-icons:python-light", dark: "skill-icons:python-dark" },
        { label: "TypeScript", light: "skill-icons:typescript", dark: "skill-icons:typescript" },
        { label: "PostgreSQL", light: "skill-icons:postgresql-light", dark: "skill-icons:postgresql-dark" },
        { label: "TensorFlow", light: "skill-icons:tensorflow-light", dark: "skill-icons:tensorflow-dark" },
        { label: "scikit-learn", light: "skill-icons:scikitlearn-light", dark: "skill-icons:scikitlearn-dark" },
        { label: "Regex", light: "skill-icons:regex", dark: "skill-icons:regex" },
      ],
    },
    {
      title: "Infra",
      skills: [
        { label: "Docker", light: "skill-icons:docker", dark: "skill-icons:docker" },
        { label: "Azure", light: "skill-icons:azure", dark: "skill-icons:azure" },
        { label: "Cloudflare", light: "skill-icons:cloudflare", dark: "skill-icons:cloudflare" },
        { label: "Supabase", light: "skill-icons:supabase-light", dark: "skill-icons:supabase-dark" },
        { label: "Vercel", light: "skill-icons:vercel-light", dark: "skill-icons:vercel-dark" },
        { label: "Terraform", light: "skill-icons:terraform-light", dark: "skill-icons:terraform-dark", learning: true },
        { label: "Kubernetes", light: "skill-icons:kubernetes", dark: "skill-icons:kubernetes", learning: true },
      ],
    },
    {
      title: "Dev",
      skills: [
        { label: "Node.js", light: "skill-icons:nodejs-light", dark: "skill-icons:nodejs-dark", learning: true },
        { label: "Tailwind", light: "skill-icons:tailwindcss-light", dark: "skill-icons:tailwindcss-dark", learning: true },
        { label: "Java", light: "skill-icons:java-light", dark: "skill-icons:java-dark" },
        { label: "C++", light: "skill-icons:cpp", dark: "skill-icons:cpp" },
        { label: "Bash", light: "skill-icons:bash-light", dark: "skill-icons:bash-dark" },
        { label: "PowerShell", light: "skill-icons:powershell", dark: "skill-icons:powershell" },
      ],
    },
    {
      title: "Web",
      skills: [
        { label: "HTML", light: "skill-icons:html", dark: "skill-icons:html" },
        { label: "CSS", light: "skill-icons:css", dark: "skill-icons:css" },
        { label: "Markdown", light: "skill-icons:markdown-light", dark: "skill-icons:markdown-dark" },
        { label: "Notion", light: "skill-icons:notion", dark: "skill-icons:notion" },
        { label: "npm", light: "skill-icons:npm", dark: "skill-icons:npm" },
        { label: "Discord", light: "skill-icons:discord", dark: "skill-icons:discord" },
      ],
    },
    {
      title: "Tools",
      skills: [
        { label: "Git", light: "skill-icons:git", dark: "skill-icons:git" },
        { label: "GitHub", light: "skill-icons:github-light", dark: "skill-icons:github-dark" },
        { label: "VS Code", light: "skill-icons:vscode-light", dark: "skill-icons:vscode-dark" },
        { label: "Anaconda", light: "skill-icons:anaconda", dark: "skill-icons:anaconda" },
        { label: "Make", light: "skill-icons:makefile", dark: "skill-icons:makefile" },
        { label: "LaTeX", light: "skill-icons:latex-light", dark: "skill-icons:latex-dark" },
        { label: "Apple", light: "skill-icons:apple-light", dark: "skill-icons:apple-dark" },
        { label: "Linux", light: "skill-icons:linux-light", dark: "skill-icons:linux-dark" },
        { label: "Ubuntu", light: "skill-icons:ubuntu-light", dark: "skill-icons:ubuntu-dark" },
        { label: "Windows", light: "skill-icons:windows-light", dark: "skill-icons:windows-dark" },
      ],
    },
  ];

  function SkillItem({ s }: { s: Skill }) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-white text-black dark:bg-white/10 dark:text-white/90 px-2 py-1">
        <Icon icon={s.light} className="size-5 block dark:hidden" aria-hidden />
        <Icon icon={s.dark} className="size-5 hidden dark:block" aria-hidden />
        <span className="text-xs">{s.label}</span>
        {s.learning && (
          <span className="ml-1 rounded bg-black/10 dark:bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Learning</span>
        )}
      </div>
    );
  }
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
      <h2>Focus</h2>
      <ul>
        <li>Agents: reasoning, tool use, safe execution</li>
        <li>Infra: solid services, simple blocks, low ops</li>
        <li>Delivery: fast loops, measurable outcomes</li>
      </ul>
      <h2>Now</h2>
      <ul>
        <li>Exploring agentic workflows with OpenAI models</li>
        <li>Improving my resume tailoring pipeline</li>
        <li>Open to roles in NL 🇳🇱, UK 🇬🇧, Switzerland 🇨🇭, Luxembourg 🇱🇺, Belgium 🇧🇪, San Francisco 🇺🇸, Italy 🇮🇹</li>
      </ul>
      <h2>Skills</h2>
      <p>Core tools I use regularly, plus a few I'm currently learning.</p>
      <div className="not-prose grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {categories.map((cat) => (
          <div key={cat.title} className="rounded-xl border border-black/10 dark:border-white/10 p-3 bg-black/5 dark:bg-white/5">
            <div className="text-sm font-medium">{cat.title}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {cat.skills.map((s) => (
                <SkillItem key={s.label} s={s} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Prose>
  );
}


