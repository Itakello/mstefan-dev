// The image is built once for every environment, so the browser gets these from the server at request time.
export type SentryRuntime = { dsn?: string; environment?: string };

export function sentryRuntimeScript(environment: NodeJS.ProcessEnv = process.env) {
  const runtime: SentryRuntime = { dsn: environment.SENTRY_DSN, environment: environment.SENTRY_ENVIRONMENT };
  return `window.__SENTRY_RUNTIME__=${JSON.stringify(runtime).replace(/</g, "\\u003c")}`;
}

// Sentry 11 collects these by default. Events carry no client IP, cookies, request bodies or local variables.
export const sentryDataCollection = { userInfo: false, cookies: false, httpBodies: [], stackFrameVariables: false };
