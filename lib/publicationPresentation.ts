import { projectPublicationMessage } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/config";
import type { ProjectPublicationMessage } from "@/lib/projectPublication";

export function projectPublicationView(locale: Locale, status: ProjectPublicationMessage) {
  return {
    message: projectPublicationMessage(locale, status),
    role: status === "empty" || status === "no-active" ? "status" : "alert",
  } as const;
}
