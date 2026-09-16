"use client";

import { useFormModified, useLivePreviewContext, useLocale, useRouteTransition } from "@payloadcms/ui";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function PreviewLocaleSync() {
  const modified = useFormModified();
  const locale = useLocale();
  const router = useRouter();
  const { startRouteTransition } = useRouteTransition();
  const { iframeRef } = useLivePreviewContext();

  useEffect(() => {
    function changeLocale(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!event.source || event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type !== "mstefan:preview-locale") return;
      const nextLocale = event.data.locale;
      if ((nextLocale !== "en" && nextLocale !== "it") || nextLocale === locale.code) return;
      if (modified && !window.confirm("You have unsaved changes. Switch language and discard those changes? Cancel to save a draft first.")) return;
      const params = new URLSearchParams(window.location.search);
      params.set("locale", nextLocale);
      startRouteTransition(() => router.push(`${window.location.pathname}?${params}` as Route));
    }
    window.addEventListener("message", changeLocale);
    return () => window.removeEventListener("message", changeLocale);
  }, [iframeRef, locale.code, modified, router, startRouteTransition]);

  return null;
}
