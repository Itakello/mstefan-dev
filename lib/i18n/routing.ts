import { defaultLocale, type Locale, supportedLocales } from "./config";
import type { PublicPath } from "./copy";

export type LocaleDecision = {
  locale: Locale;
  shouldPersist: boolean;
};

const supportedLocaleSet = new Set<Locale>(supportedLocales);
const publicPathSet = new Set<PublicPath>(["/", "/projects", "/about"]);

export type LocalizedPath = `/${Locale}` | `/${Locale}/projects` | `/${Locale}/about`;

export function isPublicPathname(pathname: string): pathname is PublicPath {
  return publicPathSet.has(pathname as PublicPath);
}

export function localizedPath(locale: Locale, pathname: PublicPath): LocalizedPath {
  return (pathname === "/" ? `/${locale}` : `/${locale}${pathname}`) as LocalizedPath;
}

export function getPublicPathname(pathname: string): PublicPath | null {
  const locale = getExplicitLocale(pathname);
  const publicPath = locale ? pathname.slice(locale.length + 1) || "/" : pathname;
  return isPublicPathname(publicPath) ? publicPath : null;
}

export function getExplicitLocale(pathname: string): Locale | null {
  const firstSegment = pathname.split("/")[1]?.toLowerCase();
  if (!firstSegment) return null;
  return isSupportedLocale(firstSegment) ? firstSegment : null;
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
  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function getLocaleFromAcceptLanguage(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return defaultLocale;

  const ranges = acceptLanguage
    .split(",")
    .map((entry, index) => {
      const [languagePart, ...params] = entry.split(";");
      const locale = languagePart.trim().toLowerCase();
      const qualityParam = params.find((part) => /^q\s*=/i.test(part.trim()));
      if (!qualityParam) return { locale, quality: 1, index };

      const quality = parseQuality(qualityParam.replace(/^\s*q\s*=\s*/i, ""));
      if (quality === null) return null;

      return {
        locale,
        quality,
        index,
      };
    })
    .filter((range): range is { locale: string; quality: number; index: number } => range !== null);

  const candidates = supportedLocales
    .map((locale) => {
      const explicit = ranges.find((range) => range.locale !== "*" && range.locale.split("-")[0] === locale);
      const wildcard = ranges.find((range) => range.locale === "*");
      const match = explicit ?? wildcard;

      return match ? { locale, quality: match.quality, index: match.index } : null;
    })
    .filter((candidate): candidate is { locale: Locale; quality: number; index: number } => candidate !== null)
    .filter((candidate) => candidate.quality > 0);

  candidates.sort((a, b) => {
    if (b.quality !== a.quality) return b.quality - a.quality;
    return a.index - b.index;
  });

  for (const item of candidates) {
    return item.locale;
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
  if (getExplicitLocale(url.pathname)) return null;

  const redirected = new URL(url);
  const publicPath = getPublicPathname(url.pathname);
  if (!publicPath) return null;
  redirected.pathname = localizedPath(locale, publicPath);
  return redirected;
}
