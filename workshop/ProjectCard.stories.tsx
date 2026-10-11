import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ProjectCard } from "@/components/ProjectCard";
import { sampleProject } from "./fixtures";

const meta = { title: "Workshop/ProjectCard", component: ProjectCard, args: sampleProject } satisfies Meta<typeof ProjectCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};
export const Expanded: Story = { args: { defaultOpen: true } };
