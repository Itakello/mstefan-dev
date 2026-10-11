import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BrandIcon } from "@/components/BrandIcon";
import { IconLink } from "@/components/IconLink";

const meta = {
  title: "Workshop/IconLink", component: IconLink,
  args: { href: "https://github.com/example", label: "GitHub", icon: <BrandIcon brand="github" /> },
} satisfies Meta<typeof IconLink>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ContactLinks: Story = {
  render: () => <div className="flex flex-wrap gap-3">
    <IconLink href="https://github.com/example" label="GitHub" icon={<BrandIcon brand="github" />} />
    <IconLink href="https://www.linkedin.com/in/example" label="LinkedIn" icon={<BrandIcon brand="linkedin" />} />
    <IconLink href="https://x.com/example" label="X" icon={<BrandIcon brand="x" />} />
  </div>,
};
