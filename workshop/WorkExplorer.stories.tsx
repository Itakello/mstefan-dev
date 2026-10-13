import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { WorkExplorer } from "@/components/WorkExplorer";
import { missingStack, readyStack, sampleMediaWork, sampleWork } from "./fixtures";
import { PROJECT_TYPES } from "@/lib/projectPublication";

const meta = {
  title: "Workshop/WorkExplorer", component: WorkExplorer,
  args: { locale: "en", items: sampleWork, stackCatalog: readyStack },
} satisfies Meta<typeof WorkExplorer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PopulatedSelection: Story = {};
export const MissingStack: Story = { args: { stackCatalog: missingStack } };
export const ResearchMedia: Story = { args: { items: sampleMediaWork } };
export const Categories: Story = { args: { items: PROJECT_TYPES.map((type, index) => ({ ...sampleWork[0], id: `category-${index}`, name: `${type} project`, type })) } };
