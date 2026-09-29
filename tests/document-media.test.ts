import { test } from "node:test";
import assert from "node:assert/strict";
import { documentMediaUrl } from "../lib/documentMedia";
test("PDF reader requests raw GitHub documents and preserves other secure hosts", () => {
  assert.equal(documentMediaUrl("https://github.com/Itakello/Academic-Repository/blob/master/2024/My%20slides.pdf?raw=true"), "https://raw.githubusercontent.com/Itakello/Academic-Repository/master/2024/My%20slides.pdf");
  assert.equal(documentMediaUrl("https://arxiv.org/pdf/2410.07109"), "https://arxiv.org/pdf/2410.07109");
  for (const value of ["http://example.com/doc.pdf", "javascript:alert(1)", "https://user:pass@example.com/doc.pdf"]) assert.throws(() => documentMediaUrl(value));
});
