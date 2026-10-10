import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyWebsitePreviews } from "../scripts/verify-website-previews";

test("refresh verifies actual served image bytes and rejects stale or missing images", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "preview-verify-"));
  const key = `website-previews/${"a".repeat(64)}/en-desktop.png`;
  const image = Buffer.from("fixture image");
  try {
    await mkdir(path.dirname(path.join(directory, key)), { recursive: true });
    await writeFile(path.join(directory, key), image);
    const request = (async (url: string | URL | Request) => {
      assert.match(String(url), /^https:\/\/previews\.example\.com\/website-previews\/.*\?capture=[a-f0-9]{64}$/);
      return new Response(image, { headers: { "content-type": "image/png" } });
    }) as typeof fetch;
    assert.equal(await verifyWebsitePreviews(directory, "https://previews.example.com", request), 1);
    await assert.rejects(verifyWebsitePreviews(directory, "https://previews.example.com", async () => new Response("old", { headers: { "content-type": "image/png" } })), /verification failed/);
    await assert.rejects(verifyWebsitePreviews(directory, "https://previews.example.com", async () => new Response("missing", { status: 404 })), /verification failed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
