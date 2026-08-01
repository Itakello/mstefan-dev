import createMDX from "@next/mdx";

const withMDX = createMDX({
  extension: /\.mdx?$/
});

const nextConfig = {
  typedRoutes: true,
  experimental: {
    mdxRs: true
  },
  pageExtensions: ["tsx", "mdx", "ts", "jsx", "js"]
};

export default withMDX(nextConfig);
