#!/usr/bin/env node
/*
  For each Notion row with Status in ['To Add', 'Added'] and missing Summary/Tags,
  fetch README.md from GitHub and use an LLM to produce summary and tags, then update Notion.

  Env vars:
    - NOTION_TOKEN, NOTION_DATABASE_ID
    - OPENAI_API_KEY (or set another provider by editing the script)
*/

const { Client } = require("@notionhq/client");
const OpenAI = require("openai");

async function fetchReadme(owner, repo) {
  const headers = { Accept: "application/vnd.github.raw+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const urls = [
    `https://api.github.com/repos/${owner}/${repo}/contents/README.md`,
    `https://api.github.com/repos/${owner}/${repo}/contents/Readme.md`,
    `https://api.github.com/repos/${owner}/${repo}/contents/readme.md`,
  ];
  for (const u of urls) {
    const res = await fetch(u, { headers });
    if (res.ok) {
      // Using raw media type above, so body is text
      return await res.text();
    }
  }
  return null;
}

async function generateSummaryAndTags(readmeText, fallbackTitle) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const system = `You summarize GitHub READMEs into a crisp 1-2 sentence description and 3-6 tags.
Return JSON with keys: summary (string), tags (string[]). Tags should be short proper nouns (e.g., React, Next.js, Python, LLM).`;
  const user = `Title: ${fallbackTitle}\nREADME (truncated to 6k chars):\n${readmeText.slice(0, 6000)}`;
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  const content = resp.choices?.[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(content);
    const summary = typeof parsed.summary === "string" ? parsed.summary : "";
    const tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : [];
    return { summary, tags };
  } catch {
    return { summary: "", tags: [] };
  }
}

function parseOwnerRepoFromUrl(url) {
  try {
    const u = new URL(url);
    const [owner, repo] = u.pathname.replace(/^\//, "").split("/");
    return { owner, repo };
  } catch {
    return { owner: null, repo: null };
  }
}

async function main() {
  const notionToken = process.env.NOTION_TOKEN;
  const notionDatabaseId = process.env.NOTION_DATABASE_ID;
  if (!notionToken || !notionDatabaseId) {
    console.error("NOTION_TOKEN and NOTION_DATABASE_ID are required");
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required for enrichment");
    process.exit(1);
  }

  const notion = new Client({ auth: notionToken });

  // Pull pages that need enrichment
  let cursor;
  const candidates = [];
  do {
    const res = await notion.databases.query({
      database_id: notionDatabaseId,
      start_cursor: cursor,
      filter: {
        and: [
          {
            or: [
              { property: "Status", status: { equals: "To Add" } },
              { property: "Status", status: { equals: "Added" } },
            ],
          },
        ],
      },
    });
    for (const r of res.results) {
      const title = (r.properties?.Name?.title || []).map((t) => t.plain_text).join("");
      const url = r.properties?.URL?.url || null;
      const summary = (r.properties?.Summary?.rich_text || []).map((t) => t.plain_text).join("");
      const hasTags = Array.isArray(r.properties?.Tags?.multi_select) && r.properties.Tags.multi_select.length > 0;
      if (!url) continue;
      if (summary && hasTags) continue; // skip already enriched
      candidates.push({ id: r.id, title, url, summary, hasTags });
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  for (const c of candidates) {
    const { owner, repo } = parseOwnerRepoFromUrl(c.url);
    if (!owner || !repo) continue;
    const readme = await fetchReadme(owner, repo);
    if (!readme) continue;
    const { summary, tags } = await generateSummaryAndTags(readme, c.title || repo);
    const properties = {};
    if (!c.summary && summary) properties.Summary = { rich_text: [{ type: "text", text: { content: summary } }] };
    if (!c.hasTags && tags.length > 0) properties.Tags = { multi_select: tags.map((t) => ({ name: t })) };
    if (Object.keys(properties).length === 0) continue;
    await notion.pages.update({ page_id: c.id, properties });
    console.log(`Enriched: ${c.title || repo}`);
  }

  console.log(`Done. Enriched ${candidates.length} candidates (some may have been skipped).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


