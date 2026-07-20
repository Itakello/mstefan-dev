import { Client } from "@notionhq/client";

import type { StackEntry } from "@/lib/stack";

export type NotionProject = {
  title: string;
  summary: string;
  url?: string;
  tags?: string[];
  year?: string;
  language?: string;
  status?: "To Add" | "Added" | "Removed";
};

function getNotionClient(): Client | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return new Client({ auth: token });
}

export async function fetchProjectsFromNotion(databaseId?: string): Promise<NotionProject[] | null> {
  const client = getNotionClient();
  const db = databaseId || process.env.NOTION_DATABASE_ID;
  if (!client || !db) return null;

  const pages: NotionProject[] = [];
  let cursor: string | undefined = undefined;

  do {
    const res = await client.databases.query({
      database_id: db,
      start_cursor: cursor,
      filter: {
        and: [
          {
            or: [
              { property: "Status", status: { equals: "Added" } },
              // Also allow items with no status to show up
              { property: "Status", status: { is_empty: true } },
            ],
          },
        ],
      },
    });

    for (const r of res.results as any[]) {
      const titleProp = r.properties?.Name?.title || [];
      const urlProp = r.properties?.URL?.url as string | null | undefined;
      const summaryProp = r.properties?.Summary?.rich_text || [];
      const tagsProp = r.properties?.Tags?.multi_select || [];
      const languageProp = r.properties?.Language?.select || null;
      const yearProp = r.properties?.Year?.number || null;

      const title = titleProp.map((t: any) => t.plain_text).join("");
      const summary = summaryProp.map((t: any) => t.plain_text).join("");
      const tags = tagsProp.map((t: any) => t.name);

      pages.push({
        title,
        summary,
        url: urlProp ?? undefined,
        tags: tags.length > 0 ? tags : undefined,
        language: languageProp?.name ?? undefined,
        year: yearProp ? String(yearProp) : undefined,
        status: r.properties?.Status?.status?.name || undefined,
      });
    }

    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);

  return pages;
}

export async function fetchStackFromNotion(databaseId?: string): Promise<StackEntry[] | null> {
  const client = getNotionClient();
  const db = databaseId || process.env.NOTION_STACK_DATABASE_ID;
  if (!client || !db) return null;

  const entries: StackEntry[] = [];
  let cursor: string | undefined;

  do {
    const response = await client.databases.query({
      database_id: db,
      start_cursor: cursor,
      sorts: [{ property: "Name", direction: "ascending" }]
    });

    for (const page of response.results as any[]) {
      entries.push(parseStackPage(page));
    }

    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  assertUniqueStackEntries(entries);
  return entries;
}

export function parseStackPage(page: any): StackEntry {
  const properties = page.properties ?? {};
  const name = richText(properties.Name?.title);
  const iconKey = richText(properties["Icon key"]?.rich_text);
  const category = properties.Category?.select?.name as string | undefined;
  const websiteVisible = properties["Website visible"]?.checkbox;
  const pageId = page.id ?? "unknown";

  if (!name) throw new Error(`Invalid Stack row ${pageId}: Name is required`);
  if (!category) throw new Error(`Invalid Stack row ${pageId}: Category is required`);
  if (!isIconifyKey(iconKey)) {
    throw new Error(`Invalid Stack row ${pageId}: Icon key must use collection:icon format`);
  }
  if (typeof websiteVisible !== "boolean") {
    throw new Error(`Invalid Stack row ${pageId}: Website visible must be a checkbox`);
  }

  return {
    name,
    iconKey,
    category,
    proficiency: properties.Proficiency?.select?.name ?? undefined,
    websiteVisible
  };
}

export async function upsertNotionProject(params: {
  databaseId?: string;
  title: string;
  url?: string;
  summary?: string;
  tags?: string[];
  language?: string;
  year?: number | string;
  status?: "To Add" | "Added" | "Removed";
}): Promise<void> {
  const client = getNotionClient();
  const db = params.databaseId || process.env.NOTION_DATABASE_ID;
  if (!client || !db) return;

  // Try to find an existing page by URL or Title
  const query = await client.databases.query({
    database_id: db,
    filter: {
      or: [
        params.url ? { property: "URL", url: { equals: params.url } } : undefined,
        { property: "Name", title: { equals: params.title } },
      ].filter(Boolean) as any,
    },
    page_size: 1,
  });

  const properties: any = {
    Name: { title: [{ type: "text", text: { content: params.title } }] },
  };
  if (params.url) properties.URL = { url: params.url };
  if (params.summary) properties.Summary = { rich_text: [{ type: "text", text: { content: params.summary } }] };
  if (params.tags) properties.Tags = { multi_select: params.tags.map((t) => ({ name: t })) };
  if (params.language) properties.Language = { select: { name: params.language } };
  if (params.year) properties.Year = { number: Number(params.year) };
  if (params.status) properties.Status = { status: { name: params.status } };

  if (query.results.length > 0) {
    await client.pages.update({
      page_id: query.results[0].id,
      properties,
    });
  } else {
    await client.pages.create({
      parent: { database_id: db },
      properties,
    });
  }
}

function richText(items: any[] | undefined) {
  return (items ?? []).map((item) => item.plain_text).join("").trim();
}

function isIconifyKey(value: string) {
  return /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9._-]*$/i.test(value);
}

export function assertUniqueStackEntries(entries: StackEntry[]) {
  const names = new Set<string>();
  const iconKeys = new Set<string>();

  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    const iconKey = entry.iconKey.toLowerCase();
    if (names.has(name)) throw new Error(`Invalid Stack data: duplicate name ${entry.name}`);
    if (iconKeys.has(iconKey)) throw new Error(`Invalid Stack data: duplicate Icon key ${entry.iconKey}`);
    names.add(name);
    iconKeys.add(iconKey);
  }
}
