import { ClientThrow } from "./ClientThrow";

// Temporary verification route; never merged.
export default async function SentryTestPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  if (kind === "server") throw new Error("Sentry verification: server render error");
  return <ClientThrow />;
}
