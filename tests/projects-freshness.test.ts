import assert from "node:assert/strict";
import test from "node:test";

import { revalidate as homeRevalidate } from "../app/page";
import { revalidate as projectsRevalidate } from "../app/projects/page";

test("refreshes Home, projects, and Toolkit from Notion every minute", () => {
  assert.equal(homeRevalidate, 60);
  assert.equal(projectsRevalidate, 60);
});
