import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AboutContent } from "@/components/cms/AboutContent";
import { getCopy } from "@/lib/i18n/copy";
import type { CareerContent } from "@/lib/cms/career-media";

const career: CareerContent = {
  id: 2, mainlineColor: "#25b8f3",
  jobs: [
    { branchName: "education/trento-master", company: "Sample University", role: "Artificial Intelligence", summary: "Master’s degree in artificial intelligence.", startDate: "2022-09-01", endDate: "2024-07-01", color: "#bf8a2b", documents: [{ title: "Master’s exam results", file: { id: 1, filename: "master-grades.pdf", url: "/master-grades.pdf", createdAt: "2024-07-01", updatedAt: "2024-07-01" } }] },
    { branchName: "education/trento-bachelor", company: "Sample University", role: "Computer Science", startDate: "2019-09-01", endDate: "2022-07-01", color: "#bf8a2b", documents: [{ title: "Bachelor’s exam results", file: { id: 2, filename: "bachelor-grades.pdf", url: "/bachelor-grades.pdf", createdAt: "2022-07-01", updatedAt: "2022-07-01" } }] },
  ],
};
const meta = {
  title: "Workshop/AboutContent", component: AboutContent,
  args: { content: getCopy("en").about, career, locale: "en" },
} satisfies Meta<typeof AboutContent>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MastersResults: Story = {
  play: ({ canvasElement }) => canvasElement.querySelector<HTMLButtonElement>("button[data-career-job]")!.click(),
};
export const BachelorsResultsWithoutSummary: Story = {
  play: ({ canvasElement }) => canvasElement.querySelectorAll<HTMLButtonElement>("button[data-career-job]")[1].click(),
};

export const ExperienceMedia: Story = {
  args: { career: { ...career, jobs: [{
    branchName: "work/sample", company: "Sample project", role: "Research", summary: "A project story with a photo and a readable document.", startDate: "2024-01-01", color: "#25b8f3",
    photo: { id: 3, url: "/workshop-portrait.jpg", alt: "Experience portrait", width: 1530, height: 2054, createdAt: "2024-01-01", updatedAt: "2024-01-01" },
    documents: [{ title: "Research paper", file: { id: 4, filename: "research.pdf", url: "/api/documents/file/workshop-research.pdf", createdAt: "2024-01-01", updatedAt: "2024-01-01" } }],
  }] } },
  play: ({ canvasElement }) => canvasElement.querySelector<HTMLButtonElement>("button[data-career-job]")!.click(),
};
