import { Client } from "@notionhq/client";

import type { Locale } from "@/lib/i18n/config";
import { isStackIconSource, type StackEntry } from "@/lib/stack";

export type LocalizedProjectCopy = {
  summary: string;
  shortSummary?: string;
};

export type NotionProject = {
  title: string;
  copy: Record<Locale, LocalizedProjectCopy>;
  url?: string;
  tags?: string[];
  year?: string;
  language?: string;
  status: "Added";
};

export type NotionProjectInventory = {
  title?: string;
  url?: string;
  status?: string;
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
        property: "Status",
        status: { equals: "Added" },
      },
    });

    pages.push(...parsePublicationProjectRows(res.results));

    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);

  return pages;
}

export async function fetchProjectInventoryFromNotion(databaseId?: string): Promise<NotionProjectInventory[] | null> {
  const client = getNotionClient();
  const db = databaseId || process.env.NOTION_DATABASE_ID;
  if (!client || !db) return null;

  const pages: NotionProjectInventory[] = [];
  let cursor: string | undefined;

  do {
    const res = await client.databases.query({
      database_id: db,
      start_cursor: cursor,
    });

    for (const page of res.results as any[]) {
      const project = parseNotionProjectInventoryPage(page);
      if (project) pages.push(project);
    }

    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);

  return pages;
}

export function parseNotionProjectPage(page: any): NotionProject | null {
  const properties = page?.properties;
  if (!properties || properties.Status?.status?.name !== "Added") return null;

  const title = richText(properties.Name?.title);
  const englishSummary = richText(properties.Summary?.rich_text);
  const italianSummary = richText(properties["Summary IT"]?.rich_text);
  if (!title || !englishSummary || !italianSummary) return null;

  const englishShortSummary = richText(properties["Short summary"]?.rich_text);
  const italianShortSummary = richText(properties["Short summary IT"]?.rich_text);
  const tags = (properties.Tags?.multi_select ?? [])
    .map((tag: any) => typeof tag?.name === "string" ? tag.name.trim() : "")
    .filter(Boolean);
  const url = typeof properties.URL?.url === "string" ? properties.URL.url : undefined;
  const language = typeof properties.Language?.multi_select?.[0]?.name === "string"
    ? properties.Language.multi_select[0].name
    : undefined;
  const year = typeof properties.Year?.number === "number" ? String(properties.Year.number) : undefined;

  return {
    title,
    copy: {
      en: { summary: englishSummary, ...(englishShortSummary ? { shortSummary: englishShortSummary } : {}) },
      it: { summary: italianSummary, ...(italianShortSummary ? { shortSummary: italianShortSummary } : {}) },
    },
    url,
    tags: tags.length > 0 ? tags : undefined,
    language,
    year,
    status: "Added",
  };
}

export function parsePublicationProjectRows(rows: readonly unknown[]): NotionProject[] {
  const projects: NotionProject[] = [];

  for (const row of rows) {
    const project = parseNotionProjectPage(row);
    if (!project) throw new Error("Invalid public project publication record");
    projects.push(project);
  }

  return projects;
}

export function parseNotionProjectInventoryPage(page: any): NotionProjectInventory | null {
  const properties = page?.properties;
  if (!properties) return null;

  const title = richText(properties.Name?.title);

  const url = typeof properties.URL?.url === "string" ? properties.URL.url : undefined;
  const status = typeof properties.Status?.status?.name === "string"
    ? properties.Status.status.name
    : undefined;

  return {
    ...(title ? { title } : {}),
    ...(url ? { url } : {}),
    ...(status ? { status } : {}),
  };
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
  if (!isStackIconSource(iconKey)) {
    throw new Error(`Invalid Stack row ${pageId}: Icon key must use collection:icon format or an approved Notion asset URL`);
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
  shortSummary?: string;
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
  if (params.shortSummary) properties["Short summary"] = { rich_text: [{ type: "text", text: { content: params.shortSummary } }] };
  if (params.summary) properties.Summary = { rich_text: [{ type: "text", text: { content: params.summary } }] };
  if (params.tags) properties.Tags = { multi_select: params.tags.map((t) => ({ name: t })) };
  if (params.language) properties.Language = { multi_select: [{ name: params.language }] };
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
