import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../workshop/*.stories.tsx"],
  framework: "@storybook/nextjs-vite",
  core: { disableTelemetry: true },
};
export default config;
