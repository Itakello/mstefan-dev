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

test("validates a trusted external icon at its source URL", async () => {
  const iconKey = "https://s3-us-west-2.amazonaws.com/public.notion-static.com/workspace/loguru.png";
  let requestedUrl = "";

  await validateStackIcons(
    [{ name: "Loguru", category: "Library", iconKey, websiteVisible: false }],
    async (input) => {
      requestedUrl = String(input);
      return new Response(null, { status: 200 });
    }
  );

  assert.equal(requestedUrl, iconKey);
});
