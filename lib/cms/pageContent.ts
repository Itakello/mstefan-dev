import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";

import type { Locale } from "@/lib/i18n/config";
import type { PageContent } from "./types";

export async function getPageContent<T extends "home" | "about">(slug: T, locale: Locale, preview: boolean): Promise<PageContent<T>> {
  const payload = await getPayload({ config });
  const user = preview ? (await payload.auth({ headers: await headers() })).user : null;
  if (preview && !user) notFound();
  const content = await payload.findGlobal({
    slug, locale, fallbackLocale: false, draft: preview, depth: 1,
    // The public projection is always the published record; REST and draft access require authentication.
    overrideAccess: !preview, user,
  });
  if (!preview && content._status !== "published") notFound();
  return content as PageContent<T>;
}
