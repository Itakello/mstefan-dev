import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentDownload, DocumentPreview } from "../components/DocumentPreview";

test("document downloads preserve local CMS files and normalize GitHub links", () => {
  const render = (url: string) => renderToStaticMarkup(createElement(DocumentDownload, { url, title: "Paper", locale: "en", filename: "paper.pdf" }));
  assert.match(render("/api/documents/file/grades.pdf"), /href="\/api\/documents\/file\/grades.pdf"/);
  assert.match(render("https://github.com/owner/repo/blob/main/paper.pdf"), /href="https:\/\/raw.githubusercontent.com\/owner\/repo\/main\/paper.pdf"/);
  assert.match(render("/api/documents/file/grades.pdf"), /download="paper.pdf"/);
  assert.match(render("/api/documents/file/grades.pdf"), /aria-label="Download PDF"/);
  assert.match(render("/api/documents/file/grades.pdf"), /data-media-download/);
  const slides = renderToStaticMarkup(createElement(DocumentDownload, { url: "https://example.com/slides.pptx", title: "Slides", locale: "it", presentation: true }));
  assert.match(slides, /aria-label="Scarica PowerPoint"/);
  assert.equal(render("javascript:alert(1)"), "");
});

test("unavailable PowerPoint previews retain an accessible download", () => {
  const html = renderToStaticMarkup(createElement(DocumentPreview, { url: "https://example.com/slides.pptx", title: "Slides", locale: "en", presentation: true }));
  assert.match(html, /Preview unavailable/);
  assert.match(html, /data-media-fallback/);
  assert.match(html, /aria-label="Download PowerPoint"/);
  assert.match(html, /href="https:\/\/example.com\/slides.pptx"/);
});
