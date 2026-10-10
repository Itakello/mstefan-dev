import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function verifyWebsitePreviews(directory: string, origin: string, request: typeof fetch = fetch) {
  const files = (await readdir(directory, { recursive: true })).filter(file => file.endsWith(".png"));
  if (!files.length || files.length > 400) throw new Error("Invalid preview verification file count.");
  for (const file of files) {
    const key = file.split(path.sep).join("/");
    if (!/^website-previews\/[a-f0-9]{64}\/(en|it)-(desktop|mobile)\.png$/.test(key)) throw new Error("Invalid preview verification key.");
    const expected = await readFile(path.join(directory, file));
    const digest = createHash("sha256").update(expected).digest("hex");
    const response = await request(`${origin}/${key}?capture=${digest}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "image/png"
      || !expected.equals(Buffer.from(await response.arrayBuffer()))) throw new Error(`Published preview verification failed: ${key}`);
  }
  return files.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const count = await verifyWebsitePreviews(process.env.WEBSITE_PREVIEW_OUTPUT_DIR!, "https://previews.mstefan.dev");
  console.log(`Verified ${count} published previews.`);
}
