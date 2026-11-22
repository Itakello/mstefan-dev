import * as Sentry from "@sentry/nextjs";

export function register() {
  // Errors only: tracing stays off to protect the free event quota.
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  });
}

export const onRequestError = Sentry.captureRequestError;
