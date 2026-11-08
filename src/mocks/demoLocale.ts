import type { Locale } from "@/i18n/locales";

let active: Locale = "ru";

export function setDemoLocale(locale: Locale): void {
  active = locale;
}

export function getDemoLocale(): Locale {
  return active;
}
