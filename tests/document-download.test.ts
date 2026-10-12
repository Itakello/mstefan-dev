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
  assert.match(render("https://arxiv.org/pdf/2410.07109"), /target="_blank" rel="noopener noreferrer"/);
  const slides = renderToStaticMarkup(createElement(DocumentDownload, { url: "https://example.com/slides.pptx", title: "Slides", locale: "it", presentation: true }));
  assert.match(slides, /aria-label="Scarica PowerPoint"/);
  assert.equal(render("javascript:alert(1)"), "");
});

test("validated HTML slide previews take precedence over the source file suffix", () => {
  for (const url of ["https://example.com/download?signature=abc", "https://example.com/slides.pdf"]) {
    const html = renderToStaticMarkup(createElement(DocumentPreview, { url, title: "Slides", locale: "en", presentation: true, previewUrl: "/presentations/physiq/index.html" }));
    assert.match(html, /data-powerpoint-preview/);
    assert.match(html, /src="\/presentations\/physiq\/index.html"/);
    assert.doesNotMatch(html, /data-pdf-preview/);
    assert.match(html, url.endsWith(".pdf") ? /aria-label="Download PDF"/ : /aria-label="Download document"/);
  }
  for (const props of [
    { presentation: true, previewUrl: undefined },
    { presentation: true, previewUrl: "https://example.com/presentations/physiq/index.html" },
    { presentation: false, previewUrl: "/presentations/physiq/index.html" },
  ]) {
    const html = renderToStaticMarkup(createElement(DocumentPreview, { url: "https://example.com/slides.pdf", title: "Slides", locale: "en", ...props }));
    assert.match(html, /data-pdf-preview/);
    assert.doesNotMatch(html, /<iframe/);
  }
});

test("unavailable PowerPoint previews retain an accessible download", () => {
  const html = renderToStaticMarkup(createElement(DocumentPreview, { url: "https://example.com/slides.pptx", title: "Slides", locale: "en", presentation: true }));
  assert.match(html, /Preview unavailable/);
  assert.match(html, /data-media-fallback/);
  assert.match(html, /aria-label="Download PowerPoint"/);
  assert.match(html, /href="https:\/\/example.com\/slides.pptx"/);
});
