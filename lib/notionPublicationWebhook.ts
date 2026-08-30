import { createHmac, publicEncrypt, timingSafeEqual } from "node:crypto";

const PUBLICATION_EVENT_TYPES = new Set([
  "page.created",
  "page.deleted",
  "page.moved",
  "page.properties_updated",
  "page.undeleted",
  "data_source.content_updated",
  "data_source.deleted",
  "data_source.moved",
  "data_source.schema_updated",
  "data_source.undeleted",
]);

type NotionWebhookPayload = {
  type?: unknown;
  entity?: { id?: unknown };
  data?: { parent?: { data_source_id?: unknown; id?: unknown } };
  verification_token?: unknown;
};

export function parseNotionWebhookPayload(rawBody: string): NotionWebhookPayload | null {
  try {
    const payload = JSON.parse(rawBody);
    return payload && typeof payload === "object" ? payload as NotionWebhookPayload : null;
  } catch {
    return null;
  }
}

export function notionVerificationToken(payload: NotionWebhookPayload) {
  return typeof payload.verification_token === "string" && payload.verification_token.length > 0
    ? payload.verification_token
    : null;
}

export function encryptNotionVerificationToken(
  verificationToken: string,
  publicKeyBase64: string | undefined,
) {
  if (!publicKeyBase64) return null;

  try {
    const publicKey = Buffer.from(publicKeyBase64, "base64").toString("utf8");
    return publicEncrypt(
      { key: publicKey, oaepHash: "sha256" },
      Buffer.from(verificationToken, "utf8"),
    ).toString("base64");
  } catch {
    return null;
  }
}

export function verifyNotionWebhookSignature(
  rawBody: string,
  signature: string | null,
  verificationToken: string | undefined,
) {
  if (!signature || !verificationToken) return false;

  const expected = `sha256=${createHmac("sha256", verificationToken).update(rawBody).digest("hex")}`;
  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function publicationNotionSourceIds(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const projectsId = environment.NOTION_PROJECTS_DATA_SOURCE_ID?.trim();
  const stackId = environment.NOTION_STACK_DATA_SOURCE_ID?.trim();
  if (!projectsId || !stackId) return null;
  if (!isNotionId(projectsId) || !isNotionId(stackId)) return null;
  if (normalizeNotionId(projectsId) === normalizeNotionId(stackId)) return null;

  return [projectsId, stackId] as const;
}

export function isPublicationNotionEvent(
  payload: NotionWebhookPayload,
  dataSourceIds: readonly (string | undefined)[],
) {
  if (typeof payload.type !== "string" || !PUBLICATION_EVENT_TYPES.has(payload.type)) {
    return false;
  }

  if (payload.type === "page.moved") return true;

  const parent = payload.data?.parent;
  const sourceId = payload.type.startsWith("data_source.") && typeof payload.entity?.id === "string"
    ? payload.entity.id
    : typeof parent?.data_source_id === "string"
      ? parent.data_source_id
      : typeof parent?.id === "string"
        ? parent.id
        : null;
  if (!sourceId) return false;

  const normalizedSourceId = normalizeNotionId(sourceId);
  return dataSourceIds.some((candidate) =>
    candidate ? normalizeNotionId(candidate) === normalizedSourceId : false,
  );
}

function normalizeNotionId(value: string) {
  return value.replaceAll("-", "").toLowerCase();
}

function isNotionId(value: string) {
  return /^[0-9a-f]{32}$/.test(normalizeNotionId(value));
}
