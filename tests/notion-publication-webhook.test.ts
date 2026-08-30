import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, privateDecrypt } from "node:crypto";
import test from "node:test";

import {
  encryptNotionVerificationToken,
  isPublicationNotionEvent,
  notionVerificationToken,
  parseNotionWebhookPayload,
  publicationNotionSourceIds,
  verifyNotionWebhookSignature,
} from "../lib/notionPublicationWebhook";

const projectsId = "24c05536-223f-8010-8423-000b87dc6df2";
const stackId = "658f4e30-0002-40e4-9e75-506129258507";

test("accepts a Notion subscription verification challenge", () => {
  const payload = parseNotionWebhookPayload(JSON.stringify({ verification_token: "secret-token" }));

  assert.ok(payload);
  assert.equal(notionVerificationToken(payload), "secret-token");
});

test("captures the verification token only as public-key encrypted ciphertext", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicKeyBase64 = Buffer.from(publicKey.export({ type: "spki", format: "pem" })).toString("base64");
  const encrypted = encryptNotionVerificationToken("secret-token", publicKeyBase64);

  assert.ok(encrypted);
  assert.equal(encrypted.includes("secret-token"), false);
  assert.equal(
    privateDecrypt(
      { key: privateKey, oaepHash: "sha256" },
      Buffer.from(encrypted, "base64"),
    ).toString("utf8"),
    "secret-token",
  );
  assert.equal(encryptNotionVerificationToken("secret-token", undefined), null);
  assert.equal(encryptNotionVerificationToken("secret-token", "invalid"), null);
});

test("verifies the raw Notion webhook body", () => {
  const body = JSON.stringify({ type: "page.properties_updated" });
  const token = "verification-token";
  const signature = `sha256=${createHmac("sha256", token).update(body).digest("hex")}`;

  assert.equal(verifyNotionWebhookSignature(body, signature, token), true);
  assert.equal(verifyNotionWebhookSignature(`${body} `, signature, token), false);
  assert.equal(verifyNotionWebhookSignature(body, null, token), false);
});

test("requires explicit, distinct data source IDs for webhook routing", () => {
  assert.deepEqual(publicationNotionSourceIds({
    NOTION_PROJECTS_DATA_SOURCE_ID: projectsId,
    NOTION_STACK_DATA_SOURCE_ID: stackId,
  }), [projectsId, stackId]);

  assert.equal(publicationNotionSourceIds({
    NOTION_DATABASE_ID: "24c05536-223f-80a0-9016-d368aa7e2cb8",
    NOTION_STACK_DATABASE_ID: "c1872097-85eb-4783-bbd6-d9e2e0ab9bd4",
  }), null);
  assert.equal(publicationNotionSourceIds({
    NOTION_PROJECTS_DATA_SOURCE_ID: projectsId,
  }), null);
  assert.equal(publicationNotionSourceIds({
    NOTION_PROJECTS_DATA_SOURCE_ID: "projects",
    NOTION_STACK_DATA_SOURCE_ID: stackId,
  }), null);
  assert.equal(publicationNotionSourceIds({
    NOTION_PROJECTS_DATA_SOURCE_ID: projectsId,
    NOTION_STACK_DATA_SOURCE_ID: projectsId.replaceAll("-", ""),
  }), null);
});

test("invalidates only publication data source events", () => {
  const stackUpdate = {
    type: "page.properties_updated",
    data: { parent: { data_source_id: stackId.replaceAll("-", "") } },
  };
  const projectsUpdate = {
    type: "data_source.schema_updated",
    entity: { id: projectsId },
  };
  const projectsPageCreated = {
    type: "page.created",
    data: { parent: { id: projectsId } },
  };
  const unrelatedUpdate = {
    type: "page.properties_updated",
    data: { parent: { data_source_id: "11111111-1111-1111-1111-111111111111" } },
  };
  const movedOutOfProjects = {
    type: "page.moved",
    data: { parent: { id: "11111111-1111-1111-1111-111111111111" } },
  };
  const stackSourceMoved = {
    type: "data_source.moved",
    entity: { id: stackId },
    data: { parent: { id: "11111111-1111-1111-1111-111111111111" } },
  };

  assert.equal(isPublicationNotionEvent(stackUpdate, [projectsId, stackId]), true);
  assert.equal(isPublicationNotionEvent(projectsUpdate, [projectsId, stackId]), true);
  assert.equal(isPublicationNotionEvent(projectsPageCreated, [projectsId, stackId]), true);
  assert.equal(isPublicationNotionEvent(movedOutOfProjects, [projectsId, stackId]), true);
  assert.equal(isPublicationNotionEvent(stackSourceMoved, [projectsId, stackId]), true);
  assert.equal(isPublicationNotionEvent(unrelatedUpdate, [projectsId, stackId]), false);
  assert.equal(isPublicationNotionEvent({ ...stackUpdate, type: "comment.created" }, [projectsId, stackId]), false);
});

test("treats duplicate publication events as the same idempotent invalidation signal", () => {
  const event = {
    id: "event-1",
    type: "page.properties_updated",
    data: { parent: { data_source_id: projectsId } },
  };

  assert.equal(isPublicationNotionEvent(event, [projectsId, stackId]), true);
  assert.equal(isPublicationNotionEvent(event, [projectsId, stackId]), true);
});
