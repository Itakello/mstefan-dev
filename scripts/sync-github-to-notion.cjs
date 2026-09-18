#!/usr/bin/env node
/*
  Sync new GitHub repos into a Notion database as rows with Status='To Add'.
  Env vars required:
    - NOTION_TOKEN
    - NOTION_DATABASE_ID
    - GITHUB_USER (default: Itakello)
    - GITHUB_TOKEN (optional, to avoid rate limit)
*/

const { Client } = require("@notionhq/client");

function buildNotionProperties(repo) {
  const year = new Date(repo.pushed_at).getFullYear();

  return {
    Name: { title: [{ type: "text", text: { content: repo.name } }] },
    URL: { url: repo.html_url },
    Language: repo.language ? { multi_select: [{ name: repo.language }] } : undefined,
    Year: { number: year },
    Status: { status: { name: "To Add" } },
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const GITHUB_USER = process.env.GITHUB_USER || "Itakello";
  const notionToken = process.env.NOTION_TOKEN;
  const notionDatabaseId = process.env.NOTION_DATABASE_ID;
  if (!notionToken || !notionDatabaseId) {
    console.error("NOTION_TOKEN and NOTION_DATABASE_ID are required");
    process.exit(1);
  }

  const notion = new Client({ auth: notionToken });

  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`, { headers });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
  const repos = await res.json();

  // Load existing Notion entries to avoid duplicates
  const existingUrls = new Set();
  let cursor = undefined;
  do {
    const q = await notion.databases.query({
      database_id: notionDatabaseId,
      start_cursor: cursor,
    });
    for (const r of q.results) {
      const url = r.properties?.URL?.url;
      if (url) existingUrls.add(url.toLowerCase());
    }
    cursor = q.has_more ? q.next_cursor : undefined;
  } while (cursor);

  const toCreate = repos
    .filter((r) => !r.private && !r.archived && !r.fork)
    .filter((r) => r.name.toLowerCase() !== GITHUB_USER.toLowerCase())
    .filter((r) => !existingUrls.has(r.html_url.toLowerCase()));

  const preview = toCreate.map((repo) => ({
    id: String(repo.id),
    name: repo.name,
    url: repo.html_url,
    visibility: repo.visibility || "public",
    defaultBranch: repo.default_branch,
    properties: buildNotionProperties(repo),
  }));

  if (!apply) {
    console.log(JSON.stringify({ status: "preview", createCount: preview.length, repositories: preview }, null, 2));
    return;
  }

  for (const r of toCreate) {
    await notion.pages.create({
      parent: { database_id: notionDatabaseId },
      properties: buildNotionProperties(r),
    });
    console.log(`Added to Notion: ${r.name}`);
  }

  console.log(`Applied. Created ${toCreate.length} new rows.`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { buildNotionProperties };
