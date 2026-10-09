import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "./edge.mjs";

const env = { ACTIVE_PRS: "12, 34" };
const request = (host, options = {}) => new Request(`https://${host}${options.path ?? "/"}`, {
  ...options,
  headers: { host, ...options.headers },
});

async function withFetch(fetcher, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try { await run(); } finally { globalThis.fetch = original; }
}

test("rejects invalid and inactive hosts without fetching", async () => {
  await withFetch(() => assert.fail("must not fetch"), async () => {
    for (const host of ["evil.test", "pr-12.preview.mstefan.dev.evil.test", "pr-012.preview.mstefan.dev", "pr-56.preview.mstefan.dev"]) {
      const response = await worker.fetch(request(host), env);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-robots-tag"), "noindex");
    }
  });
});

test("routes from the URL hostname and rejects a forged Host header", async () => {
  await withFetch(() => assert.fail("must not fetch"), async () => {
    const response = await worker.fetch(request("pr-56.preview.mstefan.dev", {
      headers: { host: "pr-12.preview.mstefan.dev" },
    }), env);
    assert.equal(response.status, 404);
  });
});

test("allows only GET and HEAD", async () => {
  await withFetch(() => assert.fail("must not fetch"), async () => {
    assert.equal((await worker.fetch(request("pr-12.preview.mstefan.dev", { method: "POST" }), env)).status, 405);
  });
});

test("routes only to the matching preview origin, strips credentials, and preserves path, query, and app headers", async () => {
  await withFetch(async (url, init) => {
    assert.equal(url, "https://preview-origin-pr-12.mstefan.dev/a/b?x=1");
    assert.equal(new URL(url).hostname.includes("production"), false);
    assert.equal(init.headers.get("authorization"), null);
    assert.equal(init.headers.get("cookie"), null);
    assert.equal(init.headers.get("x-forwarded-host"), null);
    assert.equal(init.headers.get("cache-control"), "no-store");
    assert.equal(init.headers.get("rsc"), "1");
    assert.equal(init.headers.get("range"), "bytes=0-9");
    assert.equal(init.redirect, "manual");
    assert.deepEqual(init.cf, { cacheTtl: 0, cacheEverything: false });
    return new Response("ok");
  }, async () => {
    const response = await worker.fetch(request("pr-12.preview.mstefan.dev", {
      path: "/a/b?x=1",
      headers: { authorization: "secret", cookie: "session=x", "x-forwarded-host": "production.test", rsc: "1", range: "bytes=0-9" },
    }), env);
    assert.equal(await response.text(), "ok");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-robots-tag"), "noindex");
  });
});

test("rewrites only same-origin absolute redirects, strips cookies, and keeps HEAD bodyless", async () => {
  await withFetch(async () => new Response(null, { status: 302, headers: { Location: "https://preview-origin-pr-12.mstefan.dev/login?next=%2Ffoo", "Set-Cookie": "session=secret" } }), async () => {
    const response = await worker.fetch(request("pr-12.preview.mstefan.dev", { method: "HEAD" }), env);
    assert.equal(response.headers.get("location"), "https://pr-12.preview.mstefan.dev/login?next=%2Ffoo");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(await response.text(), "");
  });
  await withFetch(async () => new Response(null, { status: 302, headers: { Location: "https://production.mstefan.dev/login" } }), async () => {
    const response = await worker.fetch(request("pr-12.preview.mstefan.dev"), env);
    assert.equal(response.headers.get("location"), "https://production.mstefan.dev/login");
  });
});

test("sanitizes origin failures", async () => {
  await withFetch(async () => { throw new Error("secret origin details"); }, async () => {
    const response = await worker.fetch(request("pr-34.preview.mstefan.dev"), env);
    assert.equal(response.status, 502);
    assert.equal(await response.text(), "Preview unavailable");
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});
