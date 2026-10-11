import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useState } from "react";
import { userEvent, within } from "storybook/test";
import { Header } from "@/components/Header";

function HeaderPreview() {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return <div className="min-h-80">{ready && <Header locale="en" />}</div>;
}

const meta = {
  title: "Workshop/Header", component: Header,
  args: { locale: "en" },
  parameters: { nextjs: { navigation: { pathname: "/en" } } },
} satisfies Meta<typeof Header>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Navigation: Story = {
  render: () => <HeaderPreview />,
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("banner");
    await Promise.all([...canvasElement.querySelectorAll("img")].map((image) => image.decode()));
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "Open navigation" }));
  },
};
