import * as Sentry from "@sentry/nextjs";

import { sentryDataCollection, type SentryRuntime } from "@/lib/sentryRuntime";

// Errors only: no tracing and no session replay, to protect the free event quota.
const runtime = (window as Window & { __SENTRY_RUNTIME__?: SentryRuntime }).__SENTRY_RUNTIME__;
Sentry.init({ dsn: runtime?.dsn, environment: runtime?.environment, dataCollection: sentryDataCollection });

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
