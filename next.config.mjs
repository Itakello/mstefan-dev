import { withPayload } from "@payloadcms/next/withPayload";
import createMDX from "@next/mdx";

const withMDX = createMDX({
  extension: /\.mdx?$/
});

const nextConfig = {
  typedRoutes: true,
  // CMS media access must be reevaluated after a photo is unpublished.
  images: { unoptimized: true },
  ...(process.env.PAYLOAD_LOCAL_PROTOTYPE === "1" ? { allowedDevOrigins: ["127.0.0.1"] } : {}),
  experimental: {
    mdxRs: true
  },
  pageExtensions: ["tsx", "mdx", "ts", "jsx", "js"]
};

export default withPayload(withMDX(nextConfig));
