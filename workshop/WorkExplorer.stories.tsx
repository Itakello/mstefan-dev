import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { WorkExplorer } from "@/components/WorkExplorer";
import { missingStack, readyStack, sampleWork } from "./fixtures";

const meta = {
  title: "Workshop/WorkExplorer", component: WorkExplorer,
  args: { locale: "en", items: sampleWork, stackCatalog: readyStack },
} satisfies Meta<typeof WorkExplorer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PopulatedSelection: Story = {};
export const MissingStack: Story = { args: { stackCatalog: missingStack } };
