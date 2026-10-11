import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../workshop/*.stories.tsx"],
  framework: "@storybook/nextjs-vite",
  core: { disableTelemetry: true },
  staticDirs: [
    { from: "../tests/fixtures", to: "/api/documents/file" },
    { from: "../public/presentations/physiq", to: "/presentations/physiq" },
  ],
};
export default config;
