import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file: string) {
  return readFile(path.join(root, file), "utf8");
}

test("localized public routes expose only the six supported paths", async () => {
  const layout = await source("app/[locale]/layout.tsx");

  assert.match(layout, /generateStaticParams/);
  assert.match(layout, /supportedLocales\.map/);
  for (const route of ["app/[locale]/page.tsx", "app/[locale]/projects/page.tsx", "app/[locale]/about/page.tsx"]) {
    assert.match(await source(route), /params: Promise<\{ locale: string \}>/);
  }
});

test("public copy and metadata are locale-aware", async () => {
  const copy = await source("lib/i18n/copy.ts");
  const metadata = await source("lib/i18n/metadata.ts");

  assert.match(copy, /Software engineer · AI systems/);
  assert.match(copy, /Ingegnere del software · sistemi di IA/);
  assert.match(metadata, /en_US/);
  assert.match(metadata, /it_IT/);
  assert.match(metadata, /canonical/);
  assert.match(metadata, /languages/);
});

test("the proxy persists explicit locales and redirects unprefixed public paths", async () => {
  const proxy = await source("proxy.ts");

  assert.match(proxy, /export function proxy/);
  assert.match(proxy, /site-locale/);
  assert.match(proxy, /buildLocaleRedirectURL/);
  assert.match(proxy, /NextResponse\.redirect/);
});

test("the D1 selector and M2 header use inline SVG flags without emoji", async () => {
  const selector = await source("components/LanguageSelector.tsx");
  const header = await source("components/Header.tsx");

  assert.match(selector, /<svg/);
  assert.match(selector, /aria-haspopup="menu"/);
  assert.match(selector, /Escape/);
  assert.match(selector, /ArrowDown/);
  assert.match(selector, /triggerRef\.current\?\.focus/);
  assert.match(selector, /onBlur/);
  assert.match(selector, /shouldCloseLanguageMenuOnFocusLeave/);
  assert.match(selector, /document\.cookie/);
  assert.doesNotMatch(selector, /🇮🇹|🇬🇧/u);
  assert.match(header, /sm:hidden/);
  assert.match(header, /LanguageSelector/);
});

test("sitemap adds localized canonicals and excludes legacy public paths", async () => {
  const config = await source("next-sitemap.config.mjs");
  const sitemap = await source("public/sitemap-0.xml");

  for (const localePath of ["/en", "/en/projects", "/en/about", "/it", "/it/projects", "/it/about"]) {
    assert.ok(config.includes(localePath));
    assert.ok(sitemap.includes(`mstefan.dev${localePath}`));
  }
  assert.doesNotMatch(sitemap, /mstefan\.dev\/(?:about|projects)(?:<|\/)/);
});
