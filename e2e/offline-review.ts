import { readFile, writeFile } from "node:fs/promises";
import type { BrowserContext } from "@playwright/test";

type IconSet = {
  prefix: string;
  width?: number;
  height?: number;
  icons: Record<string, { body: string; width?: number; height?: number }>;
  aliases?: Record<string, { parent: string }>;
};

export async function iconFixtureResponse(url: URL) {
  const prefix = url.pathname.split("/")[1].replace(/\.json$/, "");
  if (!["simple-icons", "logos", "lucide"].includes(prefix)) {
    throw new Error(`Missing official visual icon collection: ${prefix}`);
  }
  const fixture: IconSet = JSON.parse(await readFile(`tests/fixtures/visual-icons/${prefix}.json`, "utf8"));
  const names = (url.searchParams.get("icons") || "").split(",").filter(Boolean);
  if (!names.length) throw new Error(`No requested icons in ${url.href}`);
  const icons: IconSet["icons"] = {};
  for (const name of names) {
    const alias = fixture.aliases?.[name];
    const icon = fixture.icons[name] ?? (alias && fixture.icons[alias.parent]);
    if (!icon?.body) throw new Error(`Missing official visual icon fixture: ${prefix}:${name}`);
    icons[name] = alias ? { ...icon, ...alias } : icon;
  }
  return { prefix, width: fixture.width, height: fixture.height, icons };
}

export async function installOfflineReview(context: BrowserContext) {
  const base = process.env.PLAYWRIGHT_BASE_URL;
  const state = process.env.VISUAL_NOTION_FIXTURE_STATE;
  if (!base || !state) throw new Error("The isolated offline publication fixture is required");
  await writeFile(state, "multiple");
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if ((url.hostname === "example.com" && url.pathname.endsWith(".pdf")) || url.href === "https://arxiv.org/pdf/2410.07109") {
      await route.fulfill({ body: await readFile("tests/fixtures/research.pdf"), contentType: "application/pdf", headers: { "access-control-allow-origin": "*" } });
    } else if (["www.mstefan.dev", "mstefan.dev"].includes(url.hostname)) {
      const response = await route.fetch({ url: `${base}${url.pathname}${url.search}`, maxRedirects: 0 });
      await route.fulfill({ response });
    } else if (url.hostname === "api.iconify.design") {
      await route.fulfill({ json: await iconFixtureResponse(url) });
    } else if (url.origin === new URL(base).origin) {
      await route.continue();
    } else {
      throw new Error(`Unexpected external browser request: ${url.hostname}`);
    }
  });
}
