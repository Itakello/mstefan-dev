import assert from "node:assert/strict";
import test from "node:test";

import { revalidate } from "../app/projects/page";

test("refreshes Work projects and Toolkit from Notion every minute", () => {
  assert.equal(revalidate, 60);
});
