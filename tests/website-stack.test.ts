import assert from "node:assert/strict";
import test from "node:test";

import type { StackEntry } from "../lib/stack";
import { loadWebsiteStack, validateIconifyIcons } from "../lib/websiteStack";

const liveStack: StackEntry[] = [
  { name: "TypeScript", category: "Language", iconKey: "logos:typescript-icon", websiteVisible: true }
];
const fallback: StackEntry[] = [
  { name: "Fallback", category: "Tool", iconKey: "mdi:tools", websiteVisible: true }
];

test("returns valid live data in production", async () => {
  let validated = false;
  assert.equal(
    await loadWebsiteStack({
      fetchStack: async () => liveStack,
      vercelEnv: "production",
      fallback,
      validateStack: async () => { validated = true; }
    }),
    liveStack
  );
  assert.equal(validated, true);
});

test("blocks production publication when Stack data is unavailable", async () => {
  await assert.rejects(
    loadWebsiteStack({ fetchStack: async () => null, vercelEnv: "production", fallback }),
    /Cannot publish without valid Notion Stack data/
  );
  await assert.rejects(
    loadWebsiteStack({ fetchStack: async () => [], vercelEnv: "production", fallback }),
    /Cannot publish without valid Notion Stack data/
  );
  await assert.rejects(
    loadWebsiteStack({ fetchStack: async () => { throw new Error("Notion unavailable"); }, vercelEnv: "production", fallback }),
    /Cannot publish without valid Notion Stack data/
  );
});

test("keeps the fallback for non-production builds", async () => {
  assert.equal(await loadWebsiteStack({ fetchStack: async () => null, vercelEnv: "preview", fallback }), fallback);
  assert.equal(await loadWebsiteStack({ fetchStack: async () => [], fallback }), fallback);
});

test("rejects a well-formed Iconify key that does not exist", async () => {
  await assert.rejects(
    validateIconifyIcons(liveStack, async () => new Response(null, { status: 404 })),
    /Iconify icon not found for TypeScript/
  );
});
