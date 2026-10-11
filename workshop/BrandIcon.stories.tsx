import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BrandIcon } from "@/components/BrandIcon";

const meta = { title: "Workshop/BrandIcon", component: BrandIcon, args: { brand: "github" } } satisfies Meta<typeof BrandIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const BrandMarks: Story = {
  render: () => <div className="flex items-center gap-6">
    {(["github", "linkedin", "x"] as const).map(brand => <span key={brand} className="inline-flex items-center gap-2"><BrandIcon brand={brand} /><span>{brand}</span></span>)}
  </div>,
};
