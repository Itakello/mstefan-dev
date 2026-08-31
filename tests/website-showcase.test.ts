import assert from "node:assert/strict";
import test from "node:test";

import {
  canRenderWebsitePreview,
  showcaseWebsites,
  WEBSITE_PREVIEW_MAX_DEPTH,
  websitePreviewUrl,
} from "../lib/websiteShowcase";

test("showcase websites use unique secure public URLs", () => {
  const urls = showcaseWebsites.map((website) => website.url);

  assert.equal(new Set(urls).size, urls.length);
  assert.ok(urls.every((url) => url.startsWith("https://")));
});

test("the personal website preview stays in the selected locale", () => {
  assert.equal(websitePreviewUrl(showcaseWebsites[0], "it"), "https://www.mstefan.dev/it");
  assert.equal(websitePreviewUrl(showcaseWebsites[0], "en", "http://127.0.0.1:3107"), "http://127.0.0.1:3107/en");
  assert.equal(websitePreviewUrl(showcaseWebsites[1], "it"), "https://www.thekarakaltimes.com");
});

test("recursive previews stop at the configured depth", () => {
  assert.equal(canRenderWebsitePreview(WEBSITE_PREVIEW_MAX_DEPTH - 1), true);
  assert.equal(canRenderWebsitePreview(WEBSITE_PREVIEW_MAX_DEPTH), false);
});
