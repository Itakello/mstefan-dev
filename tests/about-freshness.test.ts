import assert from "node:assert/strict";
import test from "node:test";

import { revalidate } from "../app/about/page";

test("refreshes the About page from Notion every minute", () => {
  assert.equal(revalidate, 60);
});
