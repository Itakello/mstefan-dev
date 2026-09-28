"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { analyticsConfig, isAnalyticsPage } from "@/lib/analytics";

export function WebsiteAnalytics({ projectToken }: { projectToken?: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!projectToken || !isAnalyticsPage(new URL(window.location.href))) return;
    if (navigator.doNotTrack === "1") return;

    let cancelled = false;
    void import("posthog-js").then(({ default: posthog }) => {
      if (cancelled) return;
      if (!posthog.__loaded) posthog.init(projectToken, analyticsConfig);
      posthog.capture("$pageview", {
        $current_url: window.location.origin + pathname,
      });
    });
    return () => { cancelled = true; };
  }, [pathname, projectToken]);

  return null;
}
