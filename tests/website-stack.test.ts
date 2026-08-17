import assert from "node:assert/strict";
import test from "node:test";

import type { StackEntry } from "../lib/stack";
import { loadWebsiteStack, validateStackIcons } from "../lib/websiteStack";

const liveStack: StackEntry[] = [
  { name: "TypeScript", category: "Language", iconKey: "logos:typescript-icon", websiteVisible: true }
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
    message: "Stack is unavailable because the publication source is not configured.",
  });
  assert.deepEqual(await loadWebsiteStack({ fetchStack: async () => [] }), {
    status: "empty",
    entries: [],
    message: "No Stack items are currently available for publication.",
  });
  assert.deepEqual(await loadWebsiteStack({ fetchStack: async () => { throw new Error("Notion unavailable"); } }), {
    status: "error",
    entries: [],
    message: "Stack is temporarily unavailable because the publication source could not be loaded.",
  });
});

test("rejects a well-formed Iconify key that does not exist", async () => {
  await assert.rejects(
    validateStackIcons(liveStack, async () => new Response(null, { status: 404 })),
    /icon not found for TypeScript/
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
    [{ name: "Loguru", category: "Library", iconKey, websiteVisible: false }],
    async (input, init) => {
      requestedUrl = String(input);
      requestedMethod = init?.method ?? "";
      return new Response(null, { status: 200 });
    }
  );

  assert.equal(requestedUrl, iconKey);
  assert.equal(requestedMethod, "HEAD");
});
