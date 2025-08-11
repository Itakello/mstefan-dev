import createMDX from "@next/mdx";

const withMDX = createMDX({
  extension: /\.mdx?$/
});

const nextConfig = {
  experimental: {
    typedRoutes: true,
    mdxRs: true
  },
  pageExtensions: ["tsx", "mdx", "ts", "jsx", "js"]
};

export default withMDX(nextConfig);
