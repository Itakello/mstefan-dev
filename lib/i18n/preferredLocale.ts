import { cookies, headers } from "next/headers";

import { isSupportedLocale, resolveLocale } from "./routing";

export async function getPreferredLocale() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveLocale({
    pathname: "",
    cookieLocale: cookieStore.get("site-locale")?.value,
    acceptLanguage: headerStore.get("accept-language"),
  }).locale;
}

export async function getNotFoundLocale() {
  const locale = (await headers()).get("x-site-locale");
  return locale && isSupportedLocale(locale) ? locale : getPreferredLocale();
}
