import { withPayload } from "@payloadcms/next/withPayload";
import createMDX from "@next/mdx";
import { withSentryConfig } from "@sentry/nextjs/config";

const withMDX = createMDX({
  extension: /\.mdx?$/
});

const nextConfig = {
  typedRoutes: true,
  // CMS media access must be reevaluated after a photo is unpublished.
  images: { unoptimized: true },
  ...(process.env.PAYLOAD_LOCAL_PROTOTYPE === "1" ? { allowedDevOrigins: ["127.0.0.1"] } : {}),
  experimental: {
    cpus: 1,
    webpackMemoryOptimizations: true,
    mdxRs: true,
    globalNotFound: true,
  },
  pageExtensions: ["tsx", "mdx", "ts", "jsx", "js"]
};

export default withSentryConfig(withPayload(withMDX(nextConfig)), {
  org: "mstefan",
  project: "mstefan-dev",
  telemetry: false,
  // Builds without the upload token (Dependabot, forks, local) skip source maps entirely.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
  // Error tracking must not block a deploy: a failed upload costs readable stack traces, not the release.
  errorHandler: (error) => console.warn(`Sentry source map upload failed: ${error.message}`),
});
