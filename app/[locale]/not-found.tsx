import { NotFoundContent } from "@/components/NotFoundContent";
import { getNotFoundLocale } from "@/lib/i18n/preferredLocale";

export default async function NotFound() {
  return <NotFoundContent locale={await getNotFoundLocale()} projectToken={process.env.POSTHOG_PROJECT_TOKEN} />;
}
