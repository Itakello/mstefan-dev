import { revalidatePath, revalidateTag } from "next/cache";

import {
  encryptNotionVerificationToken,
  isPublicationNotionEvent,
  notionVerificationToken,
  parseNotionWebhookPayload,
  verifyNotionWebhookSignature,
} from "@/lib/notionPublicationWebhook";
import {
  PUBLICATION_CACHE_TAG,
  PUBLICATION_ROUTE_PATTERNS,
} from "@/lib/publicationCache";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const payload = parseNotionWebhookPayload(rawBody);
  if (!payload) return Response.json({ accepted: false }, { status: 400 });

  const verificationToken = notionVerificationToken(payload);
  if (verificationToken) {
    const encryptedToken = encryptNotionVerificationToken(
      verificationToken,
      process.env.NOTION_WEBHOOK_BOOTSTRAP_PUBLIC_KEY,
    );
    if (!encryptedToken) {
      return Response.json({ accepted: false, verification: false }, { status: 503 });
    }

    console.info(`[notion-webhook-verification:v1] ${encryptedToken}`);
    return Response.json({ accepted: true, verification: true });
  }

  if (!verifyNotionWebhookSignature(
    rawBody,
    request.headers.get("x-notion-signature"),
    process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN,
  )) {
    return Response.json({ accepted: false }, { status: 401 });
  }

  const relevant = isPublicationNotionEvent(payload, [
    process.env.NOTION_DATABASE_ID,
    process.env.NOTION_STACK_DATABASE_ID,
  ]);
  if (!relevant) return Response.json({ accepted: true, invalidated: false });

  revalidateTag(PUBLICATION_CACHE_TAG, { expire: 0 });
  for (const pattern of PUBLICATION_ROUTE_PATTERNS) {
    revalidatePath(pattern, "page");
  }

  return Response.json({ accepted: true, invalidated: true });
}
