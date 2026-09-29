import { test } from "node:test";
import assert from "node:assert/strict";
import { documentMediaUrl } from "../lib/documentMedia";
test("PDF reader requests raw GitHub documents and preserves other secure hosts", () => {
  assert.equal(documentMediaUrl("https://github.com/Itakello/Academic-Repository/blob/master/2024/My%20slides.pdf?raw=true"), "https://raw.githubusercontent.com/Itakello/Academic-Repository/master/2024/My%20slides.pdf");
  assert.equal(documentMediaUrl("https://arxiv.org/pdf/2410.07109"), "https://arxiv.org/pdf/2410.07109");
  for (const value of ["http://example.com/doc.pdf", "javascript:alert(1)", "https://user:pass@example.com/doc.pdf"]) assert.throws(() => documentMediaUrl(value));
});

test("PDF sources support local CMS files and retain GitHub paper URLs", () => {
  assert.equal(documentMediaUrl("/api/documents/file/grades.pdf", "http://127.0.0.1:3000"), "http://127.0.0.1:3000/api/documents/file/grades.pdf");
  assert.equal(documentMediaUrl("https://github.com/owner/repo/blob/main/paper.pdf"), "https://raw.githubusercontent.com/owner/repo/main/paper.pdf");
  assert.equal(documentMediaUrl("https://example.com/paper.pdf"), "https://example.com/paper.pdf");
});
test("PDF sources reject credentials and arbitrary insecure URLs", () => {
  for (const url of ["http://example.com/paper.pdf", "http://127.0.0.1:3000/other.pdf", "https://user:pass@example.com/paper.pdf", "javascript:alert(1)"]) {
    assert.throws(() => documentMediaUrl(url, "http://127.0.0.1:3000"));
  }
});
