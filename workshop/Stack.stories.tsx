import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StackBadge } from "@/components/StackBadge";
import { StackCatalog } from "@/components/StackCatalog";
import { sampleStack } from "./fixtures";

const meta = { title: "Workshop/Stack", component: StackBadge, args: { item: sampleStack[0] } } satisfies Meta<typeof StackBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LabeledBadge: Story = {};
export const CompactArtwork: Story = { args: { label: false, compact: true } };
export const CategorizedCatalog: Story = { render: () => <StackCatalog entries={sampleStack} locale="en" /> };
