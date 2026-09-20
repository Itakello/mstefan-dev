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
  // Only the loopback-bound application port and SSH tunnel serve the CMS.
  // Openship always overwrites X-Real-IP. A spoofed loopback Host arriving
  // through its TLS vhost must not acquire private access.
  const privateHost = !request.headers.has("x-real-ip") && /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(request.headers.get("host") ?? "");
  if (!privateHost) {
    let pathname: string;
    try { pathname = decodeURIComponent(request.nextUrl.pathname).replace(/\/+$/, ""); }
    catch { return new NextResponse(null, { status: 404 }); }
    const api = pathname === "/api" || pathname.startsWith("/api/");
    const media = pathname.startsWith("/api/media/file/") && ["GET", "HEAD"].includes(request.method);
    const webhook = ["/api/webhooks/github", "/api/webhooks/notion"].includes(pathname) && request.method === "POST";
    if (pathname === "/admin" || pathname.startsWith("/admin/") || request.nextUrl.searchParams.has("preview") || (api && !media && !webhook)) {
      return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (media) {
      const headers = new Headers(request.headers);
      headers.delete("cookie");
      headers.delete("authorization");
      const response = NextResponse.next({ request: { headers } });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
  }
  const explicitLocale = getExplicitLocale(request.nextUrl.pathname);
  if (explicitLocale) {
    const destination = buildLocaleRedirectURL(request.nextUrl, explicitLocale);
    return persistLocale(destination ? NextResponse.redirect(destination) : NextResponse.next(), explicitLocale);
  }

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
  matcher: ["/((?!_next/static|_next/image).*)"],
};
