import assert from "node:assert/strict";
import test from "node:test";
import type { CaptureResult } from "posthog-js";

import { isAnalyticsPage, sanitizeAnalyticsEvent } from "../lib/analytics";

test("analytics excludes editors, previews, private hosts and unsupported routes", () => {
  for (const url of [
    "https://www.mstefan.dev/admin", "https://www.mstefan.dev/api/users",
    "https://www.mstefan.dev/en?preview=true", "https://www.mstefan.dev/en/unknown",
    "http://localhost:3000/en", "https://preview.mstefan.dev/en",
  ]) assert.equal(isAnalyticsPage(new URL(url)), false, url);
  for (const url of ["https://mstefan.dev/en", "https://www.mstefan.dev/it/about", "https://www.mstefan.dev/en/projects/"]) {
    assert.equal(isAnalyticsPage(new URL(url)), true, url);
  }
});

test("analytics removes query strings, fragments, campaign data and initial URLs before delivery", () => {
  const event = {
    event: "$pageview",
    properties: {
      $current_url: "https://www.mstefan.dev/en?email=private@example.com#private",
      $referrer: "https://example.com/private?token=private#private",
      $initial_current_url: "https://www.mstefan.dev/en?token=private",
      $initial_referrer: "https://example.com/private",
      utm_campaign: "private", $utm_source: "private", gclid: "private",
      $pathname: "/en", $browser: "Chrome",
    },
  } as unknown as CaptureResult;
  const sanitized = sanitizeAnalyticsEvent(event);
  assert.ok(sanitized);
  assert.equal(sanitized.properties.$current_url, "https://www.mstefan.dev/en");
  assert.equal(sanitized.properties.$referrer, "https://example.com");
  assert.doesNotMatch(JSON.stringify(sanitized), /private/);
  assert.equal(sanitized.properties.$browser, "Chrome");
});

test("analytics drops unexpected events and private or invalid URLs", () => {
  assert.equal(sanitizeAnalyticsEvent(null), null);
  for (const [event, url] of [["$snapshot", "https://www.mstefan.dev/en"], ["$pageview", "https://www.mstefan.dev/admin"], ["$pageleave", "invalid"]]) {
    assert.equal(sanitizeAnalyticsEvent({ event, uuid: "test", properties: { $current_url: url } }), null);
  }
});
