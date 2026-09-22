import assert from "node:assert/strict";
import test from "node:test";

import {
  canRenderWebsitePreview,
  personalPreviewOrigin,
  showcaseWebsites,
  WEBSITE_PREVIEW_MAX_DEPTH,
  websitePreviewUrl,
} from "../lib/websiteShowcase";

test("showcase websites use unique secure public URLs", () => {
  const urls = showcaseWebsites.map((website) => website.url);

  assert.equal(new Set(urls).size, urls.length);
  assert.ok(urls.every((url) => url.startsWith("https://")));
  assert.equal(showcaseWebsites.find((website) => website.id === "mstefan")?.preview, true);
  assert.equal(showcaseWebsites.find((website) => website.id === "karakal")?.preview, false);
});

test("the personal website preview stays in the selected locale", () => {
  assert.equal(websitePreviewUrl(showcaseWebsites[0], "it"), "https://www.mstefan.dev/it");
  assert.equal(websitePreviewUrl(showcaseWebsites[0], "en", "http://127.0.0.1:3107"), "http://127.0.0.1:3107/en");
  assert.equal(websitePreviewUrl(showcaseWebsites[1], "it"), "https://www.thekarakaltimes.com");
});

test("preview builds embed the live personal site instead of an unconfigured preview homepage", () => {
  assert.equal(personalPreviewOrigin("127.0.0.1", "http://127.0.0.1:3000"), "https://www.mstefan.dev");
  assert.equal(personalPreviewOrigin("mstefan-dev-preview.vercel.app", "https://mstefan-dev-preview.vercel.app"), "https://www.mstefan.dev");
  assert.equal(personalPreviewOrigin("www.mstefan.dev", "https://www.mstefan.dev"), "https://www.mstefan.dev");
});

test("recursive previews stop at the configured depth", () => {
  assert.equal(canRenderWebsitePreview(WEBSITE_PREVIEW_MAX_DEPTH - 1), true);
  assert.equal(canRenderWebsitePreview(WEBSITE_PREVIEW_MAX_DEPTH), false);
});
