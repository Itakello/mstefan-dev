import { defaultLocale, type Locale, supportedLocales } from "./config";

export type LocaleDecision = {
  locale: Locale;
  shouldPersist: boolean;
};

const supportedLocaleSet = new Set<Locale>(supportedLocales);

export function getExplicitLocale(pathname: string): Locale | null {
  const match = pathname.match(/^\/(en|it)(?:\/|$)/);
  if (!match) return null;
  return match[1] as Locale;
}

export function isSupportedLocale(value: string): value is Locale {
  return supportedLocaleSet.has(value as Locale);
}

export function getLocaleFromCookie(cookieLocale: string | null | undefined): Locale | null {
  if (!cookieLocale) return null;
  const normalized = cookieLocale.trim().toLowerCase();
  return isSupportedLocale(normalized) ? normalized : null;
}

function parseQuality(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number.parseFloat(trimmed);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) return null;
  return parsed;
}

export function getLocaleFromAcceptLanguage(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return defaultLocale;

  const candidates = acceptLanguage
    .split(",")
    .map((entry, index) => {
      const [languagePart, ...params] = entry.split(";");
      const locale = languagePart.trim().toLowerCase();
      const qualityParam = params.find((part) => part.trim().startsWith("q="));
      const quality = parseQuality(qualityParam?.trim().slice(2) ?? "");
      const normalizedLocale = locale.split("-")[0];
      return {
        normalizedLocale,
        quality: quality === null ? 1 : quality,
        index,
      };
    })
    .filter((item) => item.quality > 0);

  candidates.sort((a, b) => {
    if (b.quality !== a.quality) return b.quality - a.quality;
    return a.index - b.index;
  });

  for (const item of candidates) {
    if (isSupportedLocale(item.normalizedLocale)) {
      return item.normalizedLocale;
    }
  }

  return defaultLocale;
}

export function resolveLocale(params: {
  pathname: string;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
}): LocaleDecision {
  const explicitLocale = getExplicitLocale(params.pathname);
  if (explicitLocale) return { locale: explicitLocale, shouldPersist: true };

  const cookie = getLocaleFromCookie(params.cookieLocale);
  if (cookie) return { locale: cookie, shouldPersist: false };

  return { locale: getLocaleFromAcceptLanguage(params.acceptLanguage), shouldPersist: false };
}

export function buildLocaleRedirectURL(url: URL, locale: Locale): URL | null {
  if (locale === defaultLocale) return null;
  if (getExplicitLocale(url.pathname)) return null;

  const redirected = new URL(url);
  redirected.pathname = url.pathname === "/" ? `/${locale}` : `/${locale}${url.pathname}`;
  return redirected;
}
