import assert from "node:assert/strict";
import test from "node:test";

import type { StackEntry } from "../lib/stack";
import { loadWebsiteStack, validateStackIcons } from "../lib/websiteStack";
import { stackPublicationMessage } from "../lib/i18n/copy";

const liveStack: StackEntry[] = [
  { name: "TypeScript", category: "Language", iconKey: "logos:typescript-icon" }
];
test("returns valid live data in production", async () => {
  let validated = false;
  assert.deepEqual(
    await loadWebsiteStack({
      fetchStack: async () => liveStack,
      vercelEnv: "production",
      validateStack: async () => { validated = true; }
    }),
    { status: "ready", entries: liveStack, message: null }
  );
  assert.equal(validated, true);
});

test("blocks production publication when Stack data is unavailable", async () => {
  await assert.rejects(
    loadWebsiteStack({ fetchStack: async () => null, vercelEnv: "production" }),
    /Cannot publish without valid Notion Stack data/
  );
  await assert.rejects(
    loadWebsiteStack({ fetchStack: async () => [], vercelEnv: "production" }),
    /Cannot publish without valid Notion Stack data/
  );
  await assert.rejects(
    loadWebsiteStack({ fetchStack: async () => { throw new Error("Notion unavailable"); }, vercelEnv: "production" }),
    /Cannot publish without valid Notion Stack data/
  );
});

test("fails closed without fallback data outside production", async () => {
  assert.deepEqual(await loadWebsiteStack({ fetchStack: async () => null, vercelEnv: "preview" }), {
    status: "unconfigured",
    entries: [],
    message: "unconfigured",
  });
  assert.deepEqual(await loadWebsiteStack({ fetchStack: async () => [] }), {
    status: "empty",
    entries: [],
    message: "empty",
  });
  assert.deepEqual(await loadWebsiteStack({ fetchStack: async () => { throw new Error("Notion unavailable"); } }), {
    status: "error",
    entries: [],
    message: "error",
  });
});

test("maps Stack failure statuses to locale-owned messages", () => {
  assert.equal(stackPublicationMessage("en", "empty"), "No Stack items are currently available for publication.");
  assert.equal(stackPublicationMessage("it", "unconfigured"), "Lo Stack non è disponibile perché la fonte di pubblicazione non è configurata.");
  assert.equal(stackPublicationMessage("it", "error"), "Lo Stack non è temporaneamente disponibile perché la fonte di pubblicazione non può essere caricata.");
});

test("rejects a well-formed Iconify key that does not exist", async () => {
  await assert.rejects(
    validateStackIcons(liveStack, async () => new Response(null, { status: 404 })),
    /icon not found for TypeScript/
  );
});

test("reuses a successful icon check across sequential and concurrent publications", async () => {
  let requests = 0;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const cache = new Map<string, Promise<void>>();
  const cacheValidation = (source: string, _rules: string, validate: () => Promise<void>) => {
    const existing = cache.get(source);
    if (existing) return existing;
    const check = validate();
    cache.set(source, check);
    return check;
  };
  const fetchIcon = async () => {
    requests++;
    await blocked;
    return new Response('<svg viewBox="0 0 24 24"><path fill="currentColor" /></svg>');
  };

  const first = validateStackIcons(liveStack, fetchIcon, cacheValidation);
  const second = validateStackIcons(liveStack, fetchIcon, cacheValidation);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 1);
  release();
  await Promise.all([first, second]);
  await validateStackIcons(liveStack, fetchIcon, cacheValidation);
  assert.equal(requests, 1);
});

test("does not cache failed icon checks", async () => {
  let requests = 0;
  const fetchIcon = async () => {
    requests++;
    return new Response(null, { status: 404 });
  };
  await assert.rejects(validateStackIcons(liveStack, fetchIcon), /icon not found/);
  await assert.rejects(validateStackIcons(liveStack, fetchIcon), /icon not found/);
  assert.equal(requests, 2);
});

test("retries a transient icon response before accepting its validated SVG", async () => {
  let requests = 0;
  let cancelled = false;
  await validateStackIcons(liveStack, async () => {
    requests++;
    return requests === 1
      ? new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 429, headers: { "Retry-After": "0" } })
      : new Response('<svg viewBox="0 0 24 24"><path fill="currentColor" /></svg>');
  });
  assert.equal(requests, 2);
  assert.equal(cancelled, true);
});

test("retries a temporary server error and a network failure", async () => {
  let requests = 0;
  await validateStackIcons(liveStack, async () => {
    requests++;
    if (requests === 1) throw new TypeError("fetch failed");
    if (requests === 2) return new Response(null, { status: 503, headers: { "Retry-After": "0" } });
    return new Response('<svg viewBox="0 0 24 24"><path fill="currentColor" /></svg>');
  });
  assert.equal(requests, 3);
});

test("retries a broken SVG response body after HTTP 200 headers", async () => {
  let requests = 0;
  await validateStackIcons(liveStack, async () => {
    requests++;
    if (requests === 1) {
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("<svg"));
          controller.error(new Error("connection lost"));
        },
      }), { status: 200 });
    }
    return new Response('<svg viewBox="0 0 24 24"><path fill="currentColor" /></svg>');
  });
  assert.equal(requests, 2);
});

test("fails closed when every SVG response body breaks", async () => {
  let requests = 0;
  await assert.rejects(validateStackIcons(liveStack, async () => {
    requests++;
    return new Response(new ReadableStream({
      start(controller) { controller.error(new Error("connection lost")); },
    }), { status: 200 });
  }), /icon unavailable for TypeScript \(network\)/);
  assert.equal(requests, 3);
});

test("still rejects invalid artwork after a transient response", async () => {
  let requests = 0;
  await assert.rejects(validateStackIcons(liveStack, async () => {
    requests++;
    return requests === 1
      ? new Response(null, { status: 503, headers: { "Retry-After": "0" } })
      : new Response('<svg viewBox="0 0 100 10"><path fill="currentColor" /></svg>');
  }), /icon is too wide/);
  assert.equal(requests, 2);
});

test("rejects a successful HTTP response that is not SVG", async () => {
  await assert.rejects(
    validateStackIcons(liveStack, async () => new Response("<html>upstream error</html>", { status: 200 })),
    /icon is not SVG for TypeScript/,
  );
});

test("rejects skill-icons artwork", async () => {
  let requested = false;

  await assert.rejects(
    validateStackIcons(
      [{ ...liveStack[0], name: "Notion", iconKey: "skill-icons:notion-dark" }],
      async () => {
        requested = true;
        return new Response('<svg viewBox="0 0 256 256"></svg>', { status: 200 });
      },
    ),
    /unsupported icon collection for Notion/,
  );

  assert.equal(requested, false);
});

test("rejects an Iconify source whose canvas is too wide for a Stack card", async () => {
  await assert.rejects(
    validateStackIcons(
      [{ ...liveStack[0], name: "Firebase", iconKey: "logos:firebase" }],
      async () => new Response('<svg viewBox="0 0 512 136"></svg>', { status: 200 }),
    ),
    /icon is too wide for Firebase/,
  );
});

test("accepts an icon-shaped Iconify source", async () => {
  let requestedMethod = "";

  await validateStackIcons(
    [{ ...liveStack[0], name: "Firebase", iconKey: "devicon:firebase" }],
    async (_input, init) => {
      requestedMethod = init?.method ?? "";
      return new Response('<svg viewBox="0 0 128 128"></svg>', { status: 200 });
    },
  );

  assert.equal(requestedMethod, "GET");
});

test("rejects Iconify artwork that is entirely black or white", async () => {
  for (const svg of [
    '<svg viewBox="0 0 24 24"><path d="M0 0h24v24z" /></svg>',
    '<svg viewBox="0 0 24 24"><path fill="#000" d="M0 0h24v24z" /></svg>',
    '<svg viewBox="0 0 24 24"><path fill="white" d="M0 0h24v24z" /></svg>',
  ]) {
    await assert.rejects(
      validateStackIcons(liveStack, async () => new Response(svg, { status: 200 })),
      /icon cannot adapt across themes for TypeScript/,
    );
  }
});

test("accepts adaptive and internally contrasted monochrome artwork", async () => {
  for (const svg of [
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M0 0h24v24z" /></svg>',
    '<svg viewBox="0 0 24 24"><path fill="#000" d="M0 0h12v24z" /><path fill="#fff" d="M12 0h12v24z" /></svg>',
  ]) {
    await validateStackIcons(liveStack, async () => new Response(svg, { status: 200 }));
  }
});

test("validates a trusted external icon at its source URL", async () => {
  const iconKey = "https://s3-us-west-2.amazonaws.com/public.notion-static.com/workspace/loguru.png";
  let requestedUrl = "";
  let requestedMethod = "";

  await validateStackIcons(
    [{ name: "Loguru", category: "Library", iconKey }],
    async (input, init) => {
      requestedUrl = String(input);
      requestedMethod = init?.method ?? "";
      return new Response(null, { status: 200 });
    }
  );

  assert.equal(requestedUrl, iconKey);
  assert.equal(requestedMethod, "HEAD");
});


test("bounds cold Stack icon validation while checking every entry", async () => {
  const entries = Array.from({ length: 46 }, (_, index) => ({
    ...liveStack[0], iconKey: `logos:icon-${index}`,
  }));
  let inFlight = 0;
  let maximum = 0;
  const requested = new Set<string>();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const validation = validateStackIcons(entries, async (input) => {
    requested.add(String(input));
    maximum = Math.max(maximum, ++inFlight);
    await blocked;
    inFlight--;
    return new Response('<svg viewBox="0 0 24 24"></svg>');
  });
  await new Promise((resolve) => setImmediate(resolve));
  const initialRequests = requested.size;
  release();
  await validation;
  assert.equal(initialRequests, 4);
  assert.equal(maximum, 4);
  assert.equal(requested.size, entries.length);
});

test("icon validation makes uncached source requests", async () => {
  await validateStackIcons(liveStack, async (_input, init) => {
    assert.equal(init?.cache, "no-store");
    return new Response('<svg viewBox="0 0 24 24"></svg>');
  });
});


test("stops scheduling icons after an unrecoverable response", async () => {
  const entries = Array.from({ length: 46 }, (_, index) => ({
    ...liveStack[0], iconKey: `logos:icon-${index}`,
  }));
  const responses: Array<(response: Response) => void> = [];
  const validation = validateStackIcons(entries, async () =>
    new Promise<Response>((resolve) => { responses.push(resolve); })
  );
  const rejected = assert.rejects(validation, /icon unavailable.*HTTP 429/);
  assert.equal(responses.length, 4);
  responses[0](new Response(null, { status: 429, headers: { "Retry-After": "221" } }));
  await rejected;
  for (const resolve of responses.slice(1)) resolve(new Response('<svg viewBox="0 0 24 24"></svg>'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(responses.length, 4);
});
