import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NotFoundContent } from "../components/NotFoundContent";

test("not-found content renders localized text and recovery links in HTML", () => {
  for (const [locale, heading] of [["en", "This page isn&#x27;t here."], ["it", "Questa pagina non c’è."]] as const) {
    const html = renderToStaticMarkup(createElement(NotFoundContent, { locale }));
    assert.ok(html.includes(heading));
    assert.ok(html.includes(`href="/${locale}"`));
    assert.ok(html.includes(`href="/${locale}/projects"`));
  }
});
