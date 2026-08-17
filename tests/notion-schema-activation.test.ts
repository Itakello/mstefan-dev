import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectProjectsSchema,
  resolveProjectsDatabaseId,
  type ProjectsSchemaClient,
} from "../lib/notionSchemaActivation";

type FakeClient = ProjectsSchemaClient & {
  databases: ProjectsSchemaClient["databases"] & { update: () => Promise<void> };
  updateCalls: number;
};

function fakeClient(properties: Record<string, { type?: unknown }>): FakeClient {
  let updateCalls = 0;

  return {
    databases: {
      async retrieve() {
        return { properties };
      },
      async update() {
        updateCalls += 1;
      },
    },
    get updateCalls() {
      return updateCalls;
    },
  };
}

test("uses the explicit Projects database variable before the repository default", () => {
  assert.equal(resolveProjectsDatabaseId({
    NOTION_PROJECTS_DATABASE_ID: "projects-db",
    NOTION_DATABASE_ID: "repository-default-db",
  }), "projects-db");
});

test("plans exactly one rich_text property when Summary IT is missing", async () => {
  const client = fakeClient({
    Summary: { type: "rich_text" },
    "Short summary IT": { type: "rich_text" },
  });

  const plan = await inspectProjectsSchema({
    token: "test-token",
    databaseId: "projects-db",
    client,
  });

  assert.deepEqual(plan, {
    state: "changes-required",
    databaseId: "projects-db",
    requiredProperty: { name: "Summary IT", type: "rich_text" },
    observedProperty: { name: "Summary IT", type: null },
    proposedAction: { kind: "add-property", property: { name: "Summary IT", type: "rich_text" } },
    applyAllowed: false,
  });
  assert.equal(client.updateCalls, 0);
});

test("is ready when Summary IT already has the required rich_text type", async () => {
  const client = fakeClient({ "Summary IT": { type: "rich_text" } });

  const plan = await inspectProjectsSchema({
    token: "test-token",
    databaseId: "projects-db",
    client,
  });

  assert.deepEqual(plan, {
    state: "ready",
    databaseId: "projects-db",
    requiredProperty: { name: "Summary IT", type: "rich_text" },
    observedProperty: { name: "Summary IT", type: "rich_text" },
    proposedAction: { kind: "none" },
    applyAllowed: false,
  });
  assert.equal(client.updateCalls, 0);
});

test("blocks instead of replacing Summary IT when its type is wrong", async () => {
  const plan = await inspectProjectsSchema({
    token: "test-token",
    databaseId: "projects-db",
    client: fakeClient({ "Summary IT": { type: "title" } }),
  });

  assert.deepEqual(plan, {
    state: "blocked",
    databaseId: "projects-db",
    requiredProperty: { name: "Summary IT", type: "rich_text" },
    observedProperty: { name: "Summary IT", type: "title" },
    proposedAction: { kind: "none" },
    applyAllowed: false,
    reason: "required-property-has-wrong-type",
  });
});

test("blocks missing credentials without leaking a token", async () => {
  const plan = await inspectProjectsSchema({
    token: undefined,
    databaseId: "projects-db",
  });

  assert.equal(plan.state, "blocked");
  assert.equal(plan.reason, "missing-notion-token");
  assert.equal(JSON.stringify(plan).includes("secret-token"), false);
});

test("blocks a missing Projects database target", async () => {
  const plan = await inspectProjectsSchema({ token: "test-token" });

  assert.equal(plan.state, "blocked");
  assert.equal(plan.databaseId, null);
  assert.equal(plan.reason, "missing-projects-database-id");
});

test("blocks provider read errors without exposing their detail", async () => {
  const plan = await inspectProjectsSchema({
    token: "secret-token",
    databaseId: "projects-db",
    client: {
      databases: {
        async retrieve() {
          throw new Error("secret-token must never be rendered");
        },
      },
    },
  });

  assert.deepEqual(plan, {
    state: "blocked",
    databaseId: "projects-db",
    requiredProperty: { name: "Summary IT", type: "rich_text" },
    observedProperty: { name: "Summary IT", type: null },
    proposedAction: { kind: "none" },
    applyAllowed: false,
    reason: "provider-read-error",
  });
  assert.equal(JSON.stringify(plan).includes("secret-token"), false);
});

test("blocks malformed database schema responses without throwing", async () => {
  for (const response of [null, undefined, [], "malformed", {}, { properties: null }, { properties: [] }]) {
    const plan = await inspectProjectsSchema({
      token: "secret-token",
      databaseId: "projects-db",
      client: {
        databases: {
          async retrieve() {
            return response as { properties?: unknown };
          },
        },
      },
    });

    assert.deepEqual(plan, {
      state: "blocked",
      databaseId: "projects-db",
      requiredProperty: { name: "Summary IT", type: "rich_text" },
      observedProperty: { name: "Summary IT", type: null },
      proposedAction: { kind: "none" },
      applyAllowed: false,
      reason: "unexpected-schema-response",
    });
    assert.equal(JSON.stringify(plan).includes("secret-token"), false);
  }
});
