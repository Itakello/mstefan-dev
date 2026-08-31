const localizedPaths = [
  "/en",
  "/en/projects",
  "/en/websites",
  "/en/about",
  "/it",
  "/it/projects",
  "/it/websites",
  "/it/about",
];

export default {
  siteUrl: "https://mstefan.dev",
  generateRobotsTxt: true,
  outDir: "./public",
  transform: async () => null,
  additionalPaths: async () => localizedPaths.map((loc) => ({ loc })),
};
