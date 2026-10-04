"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { analyticsConfig, doNotTrackEnabled, getNotFoundAnalyticsLocale, isEmbeddedContext } from "@/lib/analytics";
import type { Locale } from "@/lib/i18n/config";

export function NotFoundAnalytics({ locale, projectToken }: { locale: Locale; projectToken?: string }) {
  const pathname = usePathname();

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!getNotFoundAnalyticsLocale(url, locale) || !projectToken || isEmbeddedContext() || doNotTrackEnabled()) return;

    let cancelled = false;
    void import("posthog-js").then(({ default: posthog }) => {
      if (cancelled || isEmbeddedContext() || doNotTrackEnabled() || getNotFoundAnalyticsLocale(new URL(window.location.href), locale) !== locale) return;
      if (!posthog.__loaded) posthog.init(projectToken, analyticsConfig);
      posthog.capture("page_not_found", { $current_url: `${url.origin}/${locale}/404`, locale });
    });
    return () => { cancelled = true; };
  }, [locale, pathname, projectToken]);

  return null;
}
