import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../workshop/*.stories.tsx"],
  framework: "@storybook/nextjs-vite",
  core: { disableTelemetry: true },
  viteFinal: async config => ({ ...config, publicDir: false }),
  staticDirs: [
    { from: "../public/profile-photo.jpg", to: "/workshop-portrait.jpg" },
    { from: "../public/icon-light.png", to: "/icon-light.png" },
    { from: "../public/icon.png", to: "/icon.png" },
    { from: "../tests/fixtures", to: "/api/documents/file" },
    { from: "../public/presentations/physiq", to: "/presentations/physiq" },
  ],
};
export default config;
