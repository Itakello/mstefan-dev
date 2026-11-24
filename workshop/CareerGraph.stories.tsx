import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { CareerGraph, MAIN_KEY } from "@/components/CareerGraph";
import { sampleCareer } from "./fixtures";

function SelectableCareerGraph({ initial = MAIN_KEY }: { initial?: string }) {
  const [selectedKey, setSelectedKey] = useState(initial);
  return <CareerGraph career={sampleCareer} locale="en" now={Date.now()} selectedKey={selectedKey} onSelect={setSelectedKey} />;
}

const meta = {
  title: "Workshop/CareerGraph", component: SelectableCareerGraph,
} satisfies Meta<typeof SelectableCareerGraph>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Mainline: Story = {};
export const BranchSelected: Story = { args: { initial: sampleCareer.jobs?.[0]?.id ?? MAIN_KEY } };
