import type { CaptureResult, PostHogConfig } from "posthog-js";

export function doNotTrackEnabled() {
  if (typeof window === "undefined") return false;
  const legacyNavigator = navigator as Navigator & { msDoNotTrack?: string };
  const legacyWindow = window as Window & { doNotTrack?: string };
  return [navigator.doNotTrack, legacyNavigator.msDoNotTrack, legacyWindow.doNotTrack]
    .some((value) => value === "1" || value === "yes");
}

export function isEmbeddedContext() {
  return typeof window !== "undefined" && window.self !== window.top;
}

export function isAnalyticsPage(url: URL) {
  return (
    url.protocol === "https:" &&
    ["mstefan.dev", "www.mstefan.dev"].includes(url.hostname) &&
    /^\/(en|it)(\/(about|projects))?\/?$/.test(url.pathname) &&
    !url.searchParams.has("preview")
  );
}

export function sanitizeAnalyticsEvent(event: CaptureResult | null) {
  if (isEmbeddedContext() || doNotTrackEnabled() || !event || !["$pageview", "$pageleave"].includes(event.event)) return null;

  try {
    const url = new URL(event.properties.$current_url);
    if (!isAnalyticsPage(url)) return null;
    event.properties.$current_url = url.origin + url.pathname;
  } catch {
    return null;
  }

  for (const key of Object.keys(event.properties)) {
    if (key === "ph_keyword" || key.startsWith("$initial_") || /utm_|gclid|fbclid|msclkid|dclid|gbraid|wbraid/i.test(key)) {
      delete event.properties[key];
    }
  }
  if (event.properties.$referrer) {
    try {
      event.properties.$referrer = new URL(event.properties.$referrer).origin;
    } catch {
      delete event.properties.$referrer;
    }
  }
  return event;
}

export const analyticsConfig: Partial<PostHogConfig> = {
  api_host: "https://eu.i.posthog.com",
  ui_host: "https://eu.posthog.com",
  defaults: "2026-05-30",
  cookieless_mode: "always",
  persistence: "memory",
  person_profiles: "never",
  respect_dnt: true,
  save_campaign_params: false,
  autocapture: false,
  capture_pageview: false,
  capture_pageleave: true,
  capture_exceptions: false,
  capture_performance: false,
  disable_session_recording: true,
  disable_surveys: true,
  advanced_disable_feature_flags: true,
  before_send: sanitizeAnalyticsEvent,
};
