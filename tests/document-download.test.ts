import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentDownload } from "../components/DocumentPreview";

test("document downloads preserve local CMS files and normalize GitHub links", () => {
  const render = (url: string) => renderToStaticMarkup(createElement(DocumentDownload, { url, title: "Paper", locale: "en", filename: "paper.pdf" }));
  assert.match(render("/api/documents/file/grades.pdf"), /href="\/api\/documents\/file\/grades.pdf"/);
  assert.match(render("https://github.com/owner/repo/blob/main/paper.pdf"), /href="https:\/\/raw.githubusercontent.com\/owner\/repo\/main\/paper.pdf"/);
  assert.match(render("/api/documents/file/grades.pdf"), /download="paper.pdf"/);
  assert.equal(render("javascript:alert(1)"), "");
});
