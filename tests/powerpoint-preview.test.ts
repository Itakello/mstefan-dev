import assert from "node:assert/strict";
import test from "node:test";
import { powerPointPreviewUrl } from "../lib/powerPointPreview";

test("PowerPoint viewer uses only public GitHub PPTX sources and the requested locale", () => {
  const source = "https://github.com/Itakello/Academic-Repository/blob/master/2025/04-Thesis_Master/presentation.pptx";
  const viewer = new URL(powerPointPreviewUrl(source, "it")!);
  assert.equal(viewer.origin, "https://view.officeapps.live.com");
  assert.equal(viewer.pathname, "/op/embed.aspx");
  assert.equal(viewer.searchParams.get("src"), "https://raw.githubusercontent.com/Itakello/Academic-Repository/master/2025/04-Thesis_Master/presentation.pptx");
  assert.equal(viewer.searchParams.get("ui"), "it-IT");
  for (const suffix of ["?token=private", "#private"]) assert.equal(powerPointPreviewUrl(source + suffix, "en"), null);
  for (const url of ["https://example.com/private.pptx", "https://raw.githubusercontent.com:8443/deck.pptx", "https://raw.githubusercontent.com/deck.pdf", "https://raw.githubusercontent.com/deck.pptx?token=private", "https://raw.githubusercontent.com/deck.pptx#private", "https://raw.githubusercontent.com.evil.example/deck.pptx"]) {
    assert.equal(powerPointPreviewUrl(url, "en"), null);
  }
  assert.throws(() => powerPointPreviewUrl("http://raw.githubusercontent.com/deck.pptx", "en"));
});
