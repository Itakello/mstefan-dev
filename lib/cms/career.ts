import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";
import type { Locale } from "@/lib/i18n/config";
import type { Career } from "@/payload-types";

export async function getCareerContent(locale: Locale, preview: boolean): Promise<Career> {
  const payload = await getPayload({ config });
  const user = preview ? (await payload.auth({ headers: await headers() })).user : null;
  if (preview && !user) notFound();
  const career = await payload.findGlobal({
    slug: "career", locale, fallbackLocale: false, draft: preview, depth: 1,
    overrideAccess: !preview, user,
  });
  if (preview) return career;
  if (career._status !== "published") return { ...career, jobs: [] };
  return { ...career, jobs: career.jobs?.map((job) => job.summary?.trim() ? job : { ...job, photo: null }) };
}
