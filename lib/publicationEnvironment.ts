export function publicationEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.VERCEL_ENV) return environment.VERCEL_ENV;
  return environment.NODE_ENV === "production" && environment.SITE_DEPLOYMENT !== "private"
    ? "production"
    : undefined;
}
