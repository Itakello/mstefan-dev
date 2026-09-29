import { notFound, redirect } from "next/navigation";
import { isSupportedLocale } from "@/lib/i18n/routing";

export default async function WebsitesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  redirect(`/${locale}/projects`);
}
