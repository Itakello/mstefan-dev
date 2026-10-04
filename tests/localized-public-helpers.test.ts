import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";

import { NextRequest } from "next/server";

import { getCopy } from "../lib/i18n/copy";
import { getLanguageMenuFocusIndex, shouldCloseLanguageMenuOnFocusLeave } from "../lib/i18n/languageMenu";
import { getMailRulesCopy } from "../lib/i18n/mailRules";
import { getLocalizedMetadata } from "../lib/i18n/metadata";
import { getPublicPathname, localizedPath } from "../lib/i18n/routing";
import { isGitHubRepositoryUrl } from "../lib/projectPresentation";
import { proxy } from "../proxy";

test("localized route helpers preserve the equivalent public route", () => {
  assert.equal(getPublicPathname("/it/projects"), "/projects");
  assert.equal(getPublicPathname("/en/about"), "/about");
  assert.equal(getPublicPathname("/it/mail-rules/privacy"), "/mail-rules/privacy");
  assert.equal(getPublicPathname("/en/websites"), "/websites");
  assert.equal(localizedPath("it", "/projects"), "/it/projects");
  assert.equal(localizedPath("it", "/websites"), "/it/websites");
  assert.equal(localizedPath("en", "/mail-rules"), "/en/mail-rules");
  assert.equal(localizedPath("it", "/mail-rules/privacy"), "/it/mail-rules/privacy");
  assert.equal(getPublicPathname("/it/unknown"), null);
});

test("Mail Rules disclosures are localized and preserve the data-access boundary", () => {
  const english = getMailRulesCopy("en");
  const italian = getMailRulesCopy("it");

  assert.equal(english.overview.title, "Mail Rules");
  assert.equal(italian.privacy.title, "Informativa sulla privacy di Mail Rules");
  assert.match(english.privacy.accessBoundary, /short Gmail text snippet/);
  assert.match(english.privacy.codexHandling, /filter identifiers, criteria, and actions/);
  assert.match(english.privacy.sharing, /rule test, or approved write/);
  assert.match(english.privacy.codexHandling, /does not control or promise OpenAI's retention or training behavior/);
  assert.match(italian.privacy.deletionBoundary, /non rimuove i metadati già presenti/);
});

test("the proxy redirects unprefixed pages with a preferred locale and preserves queries", () => {
  const response = proxy(new NextRequest("https://mstefan.dev/projects?tag=ai", {
    headers: { cookie: "site-locale=it" },
  }));

  assert.equal(response.headers.get("location"), "https://mstefan.dev/it/projects?tag=ai");
  const websites = proxy(new NextRequest("https://mstefan.dev/websites?site=mstefan", {
    headers: { cookie: "site-locale=it" },
  }));
  assert.equal(websites.headers.get("location"), "https://mstefan.dev/it/websites?site=mstefan");
});

test("the proxy persists explicit locales and leaves unsupported locale segments alone", () => {
  const explicitResponse = proxy(new NextRequest("https://mstefan.dev/it/about"));
  const unsupportedResponse = proxy(new NextRequest("https://mstefan.dev/fr/about"));

  assert.equal(explicitResponse.cookies.get("site-locale")?.value, "it");
  assert.equal(unsupportedResponse.headers.get("location"), null);
});

test("the proxy replaces untrusted locale hints for missing pages", () => {
  const explicit = proxy(new NextRequest("https://mstefan.dev/it/old-link", {
    headers: { "x-site-locale": "en", "accept-language": "en" },
  }));
  const unprefixed = proxy(new NextRequest("https://mstefan.dev/old-link", {
    headers: { "x-site-locale": "fr", "accept-language": "it" },
  }));
  const unsupported = proxy(new NextRequest("https://mstefan.dev/fr/missing", {
    headers: { "x-site-locale": "en", cookie: "site-locale=it" },
  }));
  assert.equal(explicit.headers.get("x-middleware-request-x-site-locale"), "it");
  assert.equal(unprefixed.headers.get("x-middleware-request-x-site-locale"), "it");
  assert.equal(unsupported.headers.get("x-middleware-request-x-site-locale"), "it");
  assert.equal(unprefixed.headers.get("x-middleware-rewrite"), "https://mstefan.dev/__site_not_found__/missing");
});

test("bare missing paths rewrite to one path without exposing query data or touching public files", () => {
  for (const pathname of ["/old-link", "/old.html", "/fr"]) {
    const result = proxy(new NextRequest(`https://mstefan.dev${pathname}?email=private@example.com`));
    assert.equal(result.headers.get("x-middleware-rewrite"), "https://mstefan.dev/__site_not_found__/missing");
    assert.equal(result.headers.get("location"), null);
  }
  for (const file of readdirSync(new URL("../public/", import.meta.url), { withFileTypes: true }).filter((entry) => entry.isFile())) {
    const pathname = `/${file.name}`;
    assert.equal(proxy(new NextRequest(`https://mstefan.dev${pathname}`)).headers.get("x-middleware-rewrite"), null, pathname);
  }
  assert.equal(proxy(new NextRequest("https://mstefan.dev/en/unknown")).headers.get("x-middleware-rewrite"), null);
  assert.equal(proxy(new NextRequest("https://mstefan.dev/about")).headers.get("x-middleware-rewrite"), null);
});

test("the proxy redirects mixed-case locale prefixes and persists the canonical locale", () => {
  const italian = proxy(new NextRequest("https://mstefan.dev/IT/about?tag=ai"));
  const english = proxy(new NextRequest("https://mstefan.dev/EN"));
  const englishProjects = proxy(new NextRequest("https://mstefan.dev/EN/projects"));

  assert.equal(italian.headers.get("location"), "https://mstefan.dev/it/about?tag=ai");
  assert.equal(italian.cookies.get("site-locale")?.value, "it");
  assert.equal(english.headers.get("location"), "https://mstefan.dev/en");
  assert.equal(english.cookies.get("site-locale")?.value, "en");
  assert.equal(englishProjects.headers.get("location"), "https://mstefan.dev/en/projects");
});

test("localized copy and metadata expose the Italian page contract", () => {
  const metadata = getLocalizedMetadata("it", "projects");
  const italianCopy = getCopy("it");

  assert.equal(italianCopy.projectCard.viewRepository("Progetto"), "Apri il repository GitHub di Progetto");
  assert.equal(italianCopy.projects.description, "Esplora i progetti, i siti web e gli strumenti che realizzo.");
  assert.equal(getCopy("en").projects.description, "Explore the projects, websites and tools I build.");
  assert.equal(italianCopy.projectCard.viewProject("Progetto"), "Visita il progetto Progetto");
  assert.equal(italianCopy.projectCard.technologiesByCategory("Progetto"), "Tecnologie di Progetto raggruppate per categoria");
  assert.equal(italianCopy.projectCard.started("mar 2024"), "Iniziato mar 2024");
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

test("project links distinguish GitHub repositories from other approved URLs", () => {
  assert.equal(isGitHubRepositoryUrl("https://github.com/Itakello/project"), true);
  assert.equal(isGitHubRepositoryUrl("https://example.com/project"), false);
  assert.equal(isGitHubRepositoryUrl(undefined), false);
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


test("private deployment serves CMS through its tailnet hostname while public rejects spoofed hosts", () => {
  const previous = process.env.SITE_DEPLOYMENT;
  try {
    const request = (host: string, forwarded = false) => new NextRequest(`https://${host}/admin`, {
      headers: { host, ...(forwarded ? { "x-real-ip": "127.0.0.1" } : {}) },
    });
    process.env.SITE_DEPLOYMENT = "private";
    assert.equal(proxy(request("itakello-server.tailacf6a7.ts.net:10000")).status, 200);
    assert.equal(proxy(request("itakello-server.tailacf6a7.ts.net:10000", true)).status, 404);
    assert.equal(proxy(request("mstefan.dev")).status, 404);
    assert.equal(proxy(request("localhost:3000", true)).status, 404);
    delete process.env.SITE_DEPLOYMENT;
    assert.equal(proxy(request("itakello-server.tailacf6a7.ts.net:10000")).status, 404);
    assert.equal(proxy(request("localhost:3000", true)).status, 404);
    assert.equal(proxy(request("localhost:3000")).status, 200);
  } finally {
    if (previous === undefined) delete process.env.SITE_DEPLOYMENT;
    else process.env.SITE_DEPLOYMENT = previous;
  }
});
