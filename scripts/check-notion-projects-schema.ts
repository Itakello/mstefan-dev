import { Client } from "@notionhq/client";

import { inspectProjectsSchema, resolveProjectsDatabaseId } from "../lib/notionSchemaActivation";

async function main(): Promise<void> {
  if (process.argv.slice(2).includes("--apply")) {
    process.stderr.write("Schema apply is intentionally unsupported; this command is read-only.\n");
    process.exitCode = 1;
    return;
  }

  const token = process.env.NOTION_TOKEN;
  const databaseId = resolveProjectsDatabaseId();
  const client = token ? new Client({ auth: token }) : undefined;
  const plan = await inspectProjectsSchema({ token, databaseId, client });

  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  process.exitCode = plan.state === "blocked" ? 1 : 0;
}

void main();
