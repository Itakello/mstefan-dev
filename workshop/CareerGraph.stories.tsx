import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CareerGraph } from "@/components/CareerGraph";
import { sampleCareer } from "./fixtures";

const meta = {
  title: "Workshop/CareerGraph", component: CareerGraph,
  args: { career: sampleCareer, locale: "en" },
} satisfies Meta<typeof CareerGraph>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};
export const Expanded: Story = { args: { expanded: true } };
