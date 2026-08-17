import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildLocaleRedirectURL, getExplicitLocale, isPublicPathname, resolveLocale } from "@/lib/i18n/routing";

const localeCookie = "site-locale";

function persistLocale(response: NextResponse, locale: string) {
  response.cookies.set(localeCookie, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export function proxy(request: NextRequest) {
  const explicitLocale = getExplicitLocale(request.nextUrl.pathname);
  if (explicitLocale) return persistLocale(NextResponse.next(), explicitLocale);

  if (!isPublicPathname(request.nextUrl.pathname)) return NextResponse.next();

  const { locale } = resolveLocale({
    pathname: request.nextUrl.pathname,
    cookieLocale: request.cookies.get(localeCookie)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
  const destination = buildLocaleRedirectURL(request.nextUrl, locale);
  return destination ? NextResponse.redirect(destination) : NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
