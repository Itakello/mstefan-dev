import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkExplorer } from "../components/WorkExplorer";

test("Work labels image-only previews neutrally in both languages and keeps research resource labels", () => {
  const item = { id: "gallery", name: "Gallery", description: "Test media", preview: false, previewImages: [{ url: "/work-previews/physiq-puzzles.png", label: "Puzzles" }] };
  for (const [locale, media, research] of [["en", "Media preview", "Research &amp; materials"], ["it", "Anteprima multimediale", "Ricerca e materiali"]] as const) {
    const render = (resources = {}) => renderToStaticMarkup(createElement(WorkExplorer, { locale, items: [{ ...item, ...resources }], stackCatalog: { status: "ready", entries: [], message: null } }));
    assert.match(render(), new RegExp(`<section aria-label="${media}"`));
    assert.match(render({ previewImages: undefined, screenshotPages: [{ url: "https://example.com", label: "Homepage", screenshots: { desktop: "/desktop.png", mobile: "/mobile.png" } }] }), new RegExp(`<section aria-label="${media}"`));
    assert.doesNotMatch(render(), new RegExp(`<section aria-label="${research}"`));
    for (const resources of [{ paperUrl: "https://example.com/paper.pdf" }, { slidesUrl: "https://example.com/slides.pdf" }]) assert.match(render(resources), new RegExp(`<section aria-label="${research}"`));
  }
});
