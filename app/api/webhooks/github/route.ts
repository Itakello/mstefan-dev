import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { upsertNotionProject } from "@/lib/notion";

export const dynamic = "force-dynamic";

type Repo = {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  fork: boolean;
  archived: boolean;
  private: boolean;
  pushed_at?: string | null;
  updated_at?: string | null;
  owner?: { login: string };
};

function getGitHubHeaders(req: NextRequest) {
  return {
    event: req.headers.get("x-github-event") || "",
    delivery: req.headers.get("x-github-delivery") || "",
    signature256: req.headers.get("x-hub-signature-256") || "",
    userAgent: req.headers.get("user-agent") || "",
  };
}

function verifySignature(rawBody: string, signature256: string): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET || "";
  if (!secret || !signature256) return false;
  const hmac = createHmac("sha256", secret);
  const digest = Buffer.from("sha256=" + hmac.update(rawBody).digest("hex"), "utf8");
  const sigBuf = Buffer.from(signature256, "utf8");
  if (digest.length !== sigBuf.length) return false;
  return timingSafeEqual(digest, sigBuf);
}

async function fetchReadme(owner: string, repo: string): Promise<string | null> {
  const headers: Record<string, string> = { Accept: "application/vnd.github.raw+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const candidates = [
    `https://api.github.com/repos/${owner}/${repo}/contents/README.md`,
    `https://api.github.com/repos/${owner}/${repo}/contents/Readme.md`,
    `https://api.github.com/repos/${owner}/${repo}/contents/readme.md`,
  ];
  for (const url of candidates) {
    const r = await fetch(url, { headers });
    if (r.ok) return await r.text();
  }
  return null;
}

async function fetchRepoTopics(owner: string, repo: string): Promise<string[]> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/topics`, { headers });
  if (!r.ok) return [];
  const data = (await r.json()) as { names?: string[] };
  return Array.isArray(data.names) ? data.names : [];
}

function naiveSummaryFromReadme(readme: string, fallback: string): string {
  const text = readme.replace(/\r/g, "");
  const firstPara = text.split("\n\n")[0] || text.slice(0, 600);
  const clean = firstPara
    .replace(/!\[[^\]]*\]\([^\)]*\)/g, "") // images
    .replace(/\[[^\]]*\]\([^\)]*\)/g, "$1") // links
    .replace(/[#>*_`>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const s = clean || fallback || "";
  return s.length > 280 ? s.slice(0, 277) + "..." : s;
}

async function generateWithLLM(title: string, readme: string): Promise<{ summary?: string; tags?: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return {};
  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Summarize README to a 1-2 sentence summary and 3-6 tags. Return JSON {summary,tags}." },
        { role: "user", content: `Title: ${title}\nREADME:\n${readme.slice(0, 6000)}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    const content = resp.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const summary = typeof parsed.summary === "string" ? parsed.summary : undefined;
    const tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : undefined;
    return { summary, tags };
  } catch {
    return {};
  }
}

async function handleRepositoryEvent(payload: any) {
  const action = payload.action as string;
  const repo = payload.repository as Repo;
  if (!repo) return;
  if (repo.fork || repo.archived) return;
  if (action !== "created" && action !== "publicized") return;

  const year = (repo.pushed_at || repo.updated_at) ? new Date((repo.pushed_at || repo.updated_at) as string).getFullYear() : undefined;
  await upsertNotionProject({
    title: repo.name,
    url: repo.html_url,
    summary: repo.description || undefined,
    language: repo.language || undefined,
    year,
    status: "To Add",
  });
}

function includesReadmeChanged(payload: any): boolean {
  const tryList = (arr: unknown): string[] => (Array.isArray(arr) ? (arr as unknown[]).map(String) : []);
  const touched = [
    ...tryList(payload?.head_commit?.added),
    ...tryList(payload?.head_commit?.modified),
    ...tryList(payload?.head_commit?.removed),
  ];
  return touched.some((p) => /(^|\/)readme\.[a-z0-9]+$/i.test(p));
}

async function handlePushEvent(payload: any) {
  const repo = payload.repository as Repo;
  if (!repo || repo.fork || repo.archived) return;
  const owner = repo.owner?.login || (repo.full_name?.split("/")[0] ?? "");
  const name = repo.name;
  if (!owner || !name) return;

  if (!includesReadmeChanged(payload)) return;

  const readme = await fetchReadme(owner, name);
  const topics = await fetchRepoTopics(owner, name);
  const llm = readme ? await generateWithLLM(name, readme) : {};
  const fallbackSummary = readme ? naiveSummaryFromReadme(readme, repo.description || "") : (repo.description || "");
  const summary = llm.summary || fallbackSummary;
  const tags = llm.tags || (topics.length > 0 ? topics : undefined);

  await upsertNotionProject({
    title: repo.name,
    url: repo.html_url,
    summary: summary || undefined,
    tags,
    language: repo.language || undefined,
    year: repo.pushed_at ? new Date(repo.pushed_at).getFullYear() : undefined,
  });
}

export async function POST(req: NextRequest) {
  const headers = getGitHubHeaders(req);
  const raw = await req.text();
  if (!verifySignature(raw, headers.signature256)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: any = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  try {
    if (headers.event === "repository") {
      await handleRepositoryEvent(payload);
    } else if (headers.event === "push") {
      await handlePushEvent(payload);
    }
  } catch (e) {
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok");
}


