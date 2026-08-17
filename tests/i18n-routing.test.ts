import assert from "node:assert/strict";
import test from "node:test";

import { defaultLocale } from "../lib/i18n/config";
import {
  buildLocaleRedirectURL,
  getExplicitLocale,
  getLocaleFromAcceptLanguage,
  getLocaleFromCookie,
  resolveLocale,
} from "../lib/i18n/routing";

test("URL prefix takes precedence and requests persistence", () => {
  const decision = resolveLocale({
    pathname: "/it/about?foo=1",
    cookieLocale: "en",
    acceptLanguage: "en-US,en;q=0.9",
  });

  assert.equal(decision.locale, "it");
  assert.equal(decision.shouldPersist, true);
});

test("valid cookie is used when URL has no locale prefix", () => {
  const decision = resolveLocale({
    pathname: "/about",
    cookieLocale: "it",
    acceptLanguage: "en-US,en;q=0.9,it;q=0.1",
  });

  assert.equal(decision.locale, "it");
  assert.equal(decision.shouldPersist, false);
});

test("invalid cookie is ignored and Accept-Language is used", () => {
  const decision = resolveLocale({
    pathname: "/about",
    cookieLocale: "es",
    acceptLanguage: "it-IT,it;q=0.95,en;q=0.9",
  });

  assert.equal(decision.locale, "it");
  assert.equal(decision.shouldPersist, false);
});

test("Accept-Language fallback is English when Italian is not preferred", () => {
  const decision = resolveLocale({
    pathname: "/about",
    cookieLocale: null,
    acceptLanguage: "it;q=0.5,en;q=0.9",
  });

  assert.equal(decision.locale, "en");
  assert.equal(decision.shouldPersist, false);
});

test("Accept-Language parsing supports q-values and regional tags", () => {
  assert.equal(getLocaleFromAcceptLanguage("en-US,en;q=0.8,it-IT;q=0.7"), "en");
  assert.equal(getLocaleFromAcceptLanguage("de-CH;q=0.5,it;q=0.6,en;q=0.4"), "it");
  assert.equal(getLocaleFromAcceptLanguage(null), defaultLocale);
});

test("Accept-Language parser handles case-insensitive q parameter", () => {
  assert.equal(getLocaleFromAcceptLanguage("en;q=0.3,it;Q=1.0"), "it");
});

test("invalid and out-of-range q values are ignored while missing q defaults to 1", () => {
  assert.equal(getLocaleFromAcceptLanguage("en;q=not-a-number,it;q=0.4"), "it");
  assert.equal(getLocaleFromAcceptLanguage("en;q=2,it;q=0.4"), "it");
  assert.equal(getLocaleFromAcceptLanguage("en;q=0.5oops,it;q=0.4"), "it");
  assert.equal(getLocaleFromAcceptLanguage("en;q=0.4,it"), "it");
});

test("wildcard ranges fallback to supported locales when explicit values are unacceptable", () => {
  assert.equal(getLocaleFromAcceptLanguage("en;q=0,*;q=1"), "it");
});

test("explicit locale from path only matches prefix segments", () => {
  assert.equal(getExplicitLocale("/it"), "it");
  assert.equal(getExplicitLocale("/en/about"), "en");
  assert.equal(getExplicitLocale("/support/it"), null);
});

test("invalid cookie never becomes a locale", () => {
  assert.equal(getLocaleFromCookie("fr"), null);
  assert.equal(getLocaleFromCookie(""), null);
  assert.equal(getLocaleFromCookie(null), null);
});

test("locale redirects preserve path and query", () => {
  const destination = buildLocaleRedirectURL(new URL("https://example.com/projects?sort=recent&tag=dev"), "it");
  assert.equal(destination?.toString(), "https://example.com/it/projects?sort=recent&tag=dev");
});

test("locale redirect from root path preserves query", () => {
  const destination = buildLocaleRedirectURL(new URL("https://example.com/?foo=bar&lang=en"), "it");
  assert.equal(destination?.toString(), "https://example.com/it?foo=bar&lang=en");
});

test("already localized paths do not redirect", () => {
  const destination = buildLocaleRedirectURL(new URL("https://example.com/it/projects?sort=recent&tag=dev"), "it");
  assert.equal(destination, null);
});

test("default locale receives an explicit prefix", () => {
  const destination = buildLocaleRedirectURL(new URL("https://example.com/projects?sort=recent"), defaultLocale);
  assert.equal(destination?.toString(), "https://example.com/en/projects?sort=recent");
});
