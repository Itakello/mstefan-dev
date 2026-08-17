export const supportedLocales = ["en", "it"] as const;

export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = "en";
