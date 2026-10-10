import type { StackEntry } from "@/lib/stack";
import type { WebsiteStackState } from "@/lib/websiteStack";
import type { ShowcaseWebsite } from "@/lib/websiteShowcase";
import type { Career } from "@/payload-types";

// Workshop-only samples; never a publication source or a production fallback.
export const sampleStack: StackEntry[] = [
  { name: "TypeScript", category: "Language", iconKey: "logos:typescript-icon" },
  { name: "Python", category: "Language", iconKey: "logos:python" },
  { name: "Next.js", category: "Framework", iconKey: "logos:nextjs-icon" },
  { name: "React", category: "Library", iconKey: "logos:react" },
  { name: "React DOM", category: "Library", iconKey: "logos:react" },
  { name: "React Router", category: "Library", iconKey: "logos:react-router" },
  { name: "React Test Renderer", category: "Library", iconKey: "logos:react" },
  { name: "Tailwind CSS", category: "Library", iconKey: "logos:tailwindcss-icon" },
  { name: "Node.js", category: "Runtime", iconKey: "logos:nodejs-icon" },
  { name: "MongoDB", category: "Database", iconKey: "logos:mongodb-icon" },
  { name: "Docker", category: "Platform", iconKey: "logos:docker-icon" },
];

export const readyStack: WebsiteStackState = { status: "ready", entries: sampleStack, message: null };
export const missingStack: WebsiteStackState = { status: "unconfigured", entries: [], message: "unconfigured" };

export const sampleProject = {
  title: "Workshop task board",
  shortSummary: "A small board for choosing the next useful task.",
  summary: "A sample task board that keeps one selected task visible while the remaining tasks wait in a short queue. Keyboard navigation and clear project details make the next step easy to find.",
  createdAt: "2024-03-15T00:00:00.000Z",
  url: "https://github.com/example/workshop-task-board",
  language: "TypeScript",
  tags: ["Next.js", "React", "React DOM", "React Router", "React Test Renderer", "Tailwind CSS", "Node.js", "MongoDB", "Docker"],
  stackCatalog: sampleStack,
  locale: "en" as const,
};

export const sampleWork: ShowcaseWebsite[] = [
  {
    id: "workshop-task-board",
    type: "Tool",
    name: sampleProject.title,
    description: sampleProject.summary,
    shortDescription: sampleProject.shortSummary,
    sourceUrl: sampleProject.url,
    year: "2024",
    language: sampleProject.language,
    tags: sampleProject.tags,
    preview: false,
  },
  {
    id: "workshop-data-notebook",
    type: "Research",
    name: "Workshop data notebook",
    description: "A sample research notebook comparing two small datasets and explaining their differences. This workshop entry includes no document or remote preview.",
    shortDescription: "A small comparison with an explicit method.",
    year: "2023",
    language: "Python",
    tags: ["Docker"],
    preview: false,
  },
];

export const sampleCareer: Career = {
  id: 1,
  mainlineColor: "#25b8f3",
  laneSpacing: 24,
  jobs: [
    {
      id: "workshop-platform",
      branchName: "work/platform",
      company: "Sample Platform Team",
      role: "Full-stack developer",
      summary: "Built a small internal planning tool and improved its keyboard navigation.",
      startDate: "2022-09-01T00:00:00.000Z",
      endDate: "2024-06-01T00:00:00.000Z",
      color: "#25b8f3",
    },
    {
      id: "workshop-research",
      branchName: "education/research",
      parentBranchName: "education/university",
      company: "Sample Research Lab",
      role: "Research project",
      summary: "Compared a pair of datasets and documented a reproducible analysis.",
      startDate: "2021-02-01T00:00:00.000Z",
      endDate: "2021-07-01T00:00:00.000Z",
      color: "#bf8a2b",
    },
    {
      id: "workshop-university",
      branchName: "education/university",
      company: "Sample University",
      role: "Computer science",
      summary: "Studied software engineering and applied the fundamentals in team projects.",
      startDate: "2019-09-01T00:00:00.000Z",
      endDate: "2022-07-01T00:00:00.000Z",
      color: "#bf8a2b",
    },
  ],
};
