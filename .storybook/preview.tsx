import type { Preview } from "@storybook/nextjs-vite";
import { addCollection } from "@iconify/react";
import { useEffect } from "react";
import { MotionConfig } from "motion/react";
import "../app/globals.css";
import simpleIcons from "../tests/fixtures/visual-icons/simple-icons.json";
import logos from "../tests/fixtures/visual-icons/logos.json";
import lucide from "../tests/fixtures/visual-icons/lucide.json";

for (const collection of [simpleIcons, logos, lucide]) addCollection(collection);

function Surface({ children, theme }: { children: React.ReactNode; theme: string }) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return <MotionConfig reducedMotion="always"><main className="container py-6">{children}</main></MotionConfig>;
}

const preview: Preview = {
  globalTypes: {
    theme: { description: "Site theme", toolbar: { icon: "circlehollow", items: ["light", "dark"] } },
  },
  initialGlobals: { theme: "light" },
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  decorators: [(Story, context) => <Surface theme={context.globals.theme}><Story /></Surface>],
};
export default preview;
