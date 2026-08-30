import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, privateDecrypt } from "node:crypto";
import test from "node:test";

import {
  encryptNotionVerificationToken,
  isPublicationNotionEvent,
  notionVerificationToken,
  parseNotionWebhookPayload,
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

  assert.equal(isPublicationNotionEvent(stackUpdate, [projectsId, stackId]), true);
  assert.equal(isPublicationNotionEvent(projectsUpdate, [projectsId, stackId]), true);
  assert.equal(isPublicationNotionEvent(projectsPageCreated, [projectsId, stackId]), true);
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
