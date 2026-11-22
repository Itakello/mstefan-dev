import * as Sentry from "@sentry/nextjs";

// Errors only: no tracing and no session replay, to protect the free event quota.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
});
