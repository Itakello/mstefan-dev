import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildLocaleRedirectURL, getExplicitLocale, isPublicPathname, resolveLocale } from "@/lib/i18n/routing";

const localeCookie = "site-locale";
const publicFiles = new Set(["/robots.txt", "/sitemap.xml", "/sitemap-0.xml", "/icon.svg", "/profile-photo.jpg", "/profile-avatar.jpg"]);

function persistLocale(response: NextResponse, locale: string) {
  response.cookies.set(localeCookie, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export function proxy(request: NextRequest) {
  // The preview CMS is reachable at its verified tailnet address. A public
  // Host header must never acquire CMS access, even on the private deployment.
  const host = request.headers.get("host") ?? "";
  const privateHost = !request.headers.has("x-real-ip") && (
    (process.env.SITE_DEPLOYMENT === "private" && host.toLowerCase() === "itakello-server.tailacf6a7.ts.net:10000")
    || /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)
  );
  if (!privateHost) {
    let pathname: string;
    try { pathname = decodeURIComponent(request.nextUrl.pathname).replace(/\/+$/, ""); }
    catch { return new NextResponse(null, { status: 404 }); }
    const api = pathname === "/api" || pathname.startsWith("/api/");
    const publishedFile = (pathname.startsWith("/api/media/file/") || pathname.startsWith("/api/documents/file/")) && ["GET", "HEAD"].includes(request.method);
    const webhook = ["/api/webhooks/github", "/api/webhooks/notion"].includes(pathname) && request.method === "POST";
    if (pathname === "/admin" || pathname.startsWith("/admin/") || request.nextUrl.searchParams.has("preview") || (api && !publishedFile && !webhook)) {
      return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (publishedFile) {
      const headers = new Headers(request.headers);
      headers.delete("cookie");
      headers.delete("authorization");
      const response = NextResponse.next({ request: { headers } });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
  }
  const { locale } = resolveLocale({
    pathname: request.nextUrl.pathname,
    cookieLocale: request.cookies.get(localeCookie)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
  const nextWithLocale = () => {
    const headers = new Headers(request.headers);
    headers.set("x-site-locale", locale);
    return NextResponse.next({ request: { headers } });
  };
  const explicitLocale = getExplicitLocale(request.nextUrl.pathname);
  if (explicitLocale) {
    const destination = buildLocaleRedirectURL(request.nextUrl, explicitLocale);
    return persistLocale(destination ? NextResponse.redirect(destination) : nextWithLocale(), explicitLocale);
  }

  if (!isPublicPathname(request.nextUrl.pathname)) {
    const pathname = request.nextUrl.pathname.replace(/\/+$/, "");
    if (!privateHost && /^\/[^/]+$/.test(pathname) && !publicFiles.has(pathname)) {
      const destination = new URL(request.nextUrl);
      destination.pathname = "/__site_not_found__/missing";
      destination.search = "";
      const headers = new Headers(request.headers);
      headers.set("x-site-locale", locale);
      return NextResponse.rewrite(destination, { request: { headers } });
    }
    return nextWithLocale();
  }

  const destination = buildLocaleRedirectURL(request.nextUrl, locale);
  return destination ? NextResponse.redirect(destination) : nextWithLocale();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
