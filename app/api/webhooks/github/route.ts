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

async function handleRepositoryEvent(payload: any) {
  const action = payload.action as string;
  const repo = payload.repository as Repo;
  if (!repo) return;
  if (repo.private || repo.fork || repo.archived) return;
  if (action !== "created" && action !== "publicized") return;

  const year = (repo.pushed_at || repo.updated_at) ? new Date((repo.pushed_at || repo.updated_at) as string).getFullYear() : undefined;
  await upsertNotionProject({
    title: repo.name,
    url: repo.html_url,
    language: repo.language || undefined,
    year,
    status: "To Add",
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
    }
  } catch (e) {
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok");
}

