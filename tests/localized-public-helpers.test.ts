import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { getCopy } from "../lib/i18n/copy";
import { getLanguageMenuFocusIndex, shouldCloseLanguageMenuOnFocusLeave } from "../lib/i18n/languageMenu";
import { getLocalizedMetadata } from "../lib/i18n/metadata";
import { getPublicPathname, localizedPath } from "../lib/i18n/routing";
import { proxy } from "../proxy";

test("localized route helpers preserve the equivalent public route", () => {
  assert.equal(getPublicPathname("/it/projects"), "/projects");
  assert.equal(getPublicPathname("/en/about"), "/about");
  assert.equal(localizedPath("it", "/projects"), "/it/projects");
  assert.equal(getPublicPathname("/it/unknown"), null);
});

test("the proxy redirects unprefixed pages with a preferred locale and preserves queries", () => {
  const response = proxy(new NextRequest("https://mstefan.dev/projects?tag=ai", {
    headers: { cookie: "site-locale=it" },
  }));

  assert.equal(response.headers.get("location"), "https://mstefan.dev/it/projects?tag=ai");
});

test("the proxy persists explicit locales and leaves unsupported locale segments alone", () => {
  const explicitResponse = proxy(new NextRequest("https://mstefan.dev/it/about"));
  const unsupportedResponse = proxy(new NextRequest("https://mstefan.dev/fr/about"));

  assert.equal(explicitResponse.cookies.get("site-locale")?.value, "it");
  assert.equal(unsupportedResponse.headers.get("location"), null);
});

test("localized copy and metadata expose the Italian page contract", () => {
  const metadata = getLocalizedMetadata("it", "projects");
  const italianCopy = getCopy("it");

  assert.equal(italianCopy.projectCard.viewRepository("Progetto"), "Apri il repository GitHub di Progetto");
  assert.equal(italianCopy.projectCard.technologiesByCategory("Progetto"), "Tecnologie di Progetto raggruppate per categoria");
  assert.equal(italianCopy.stack.scrollLeft, "Scorri le tecnologie verso sinistra");
  assert.equal(getCopy("en").stack.showMore(1, "framework"), "Show 1 more framework technology");
  assert.equal(getCopy("en").stack.hideMore(1, "framework"), "Hide 1 framework technology");
  assert.equal(italianCopy.stack.showMore(1, "framework"), "Mostra 1 altra tecnologia framework");
  assert.equal(italianCopy.stack.hideMore(1, "framework"), "Nascondi 1 tecnologia framework");
  assert.equal(italianCopy.stack.showMore(2, "framework"), "Mostra altre 2 tecnologie framework");
  assert.equal(italianCopy.stack.hideMore(2, "framework"), "Nascondi 2 tecnologie framework");
  assert.equal(metadata.alternates?.canonical, "/it/projects");
  assert.deepEqual(metadata.alternates?.languages, { en: "/en/projects", it: "/it/projects" });
  assert.equal(metadata.openGraph?.locale, "it_IT");
});

test("language menu closes only when focus leaves its container", () => {
  assert.equal(shouldCloseLanguageMenuOnFocusLeave(true), false);
  assert.equal(shouldCloseLanguageMenuOnFocusLeave(false), true);
});

test("language menu focus wraps and supports Home and End", () => {
  assert.equal(getLanguageMenuFocusIndex(0, "ArrowDown", 2), 1);
  assert.equal(getLanguageMenuFocusIndex(1, "ArrowDown", 2), 0);
  assert.equal(getLanguageMenuFocusIndex(0, "ArrowUp", 2), 1);
  assert.equal(getLanguageMenuFocusIndex(1, "Home", 2), 0);
  assert.equal(getLanguageMenuFocusIndex(0, "End", 2), 1);
  assert.equal(getLanguageMenuFocusIndex(1, "Enter", 2), null);
});
