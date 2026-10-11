import assert from "node:assert/strict";
import test from "node:test";
import { presentationPreviewUrl } from "../lib/powerPointPreview";

test("presentation embeds accept only owned static exports and use the current origin", () => {
  for (const source of ["/presentations/physiq/index.html", "https://www.mstefan.dev/presentations/physiq/index.html", "https://mstefan.dev/presentations/physiq/index.html"]) {
    assert.equal(presentationPreviewUrl(source), "/presentations/physiq/index.html");
  }
  for (const source of ["https://view.officeapps.live.com/op/embed.aspx", "https://example.com/presentations/physiq/index.html", "//evil.example/presentations/physiq/index.html", "http://mstefan.dev/presentations/physiq/index.html", "https://user:secret@mstefan.dev/presentations/physiq/index.html", "/presentations/physiq/index.html?token=private", "/presentations/physiq/index.html#secret", "/presentations/../index.html", "/presentations/physiq/deck.pptx", "invalid"]) {
    assert.equal(presentationPreviewUrl(source), null);
  }
});
