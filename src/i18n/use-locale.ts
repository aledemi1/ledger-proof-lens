import { useRouterState } from "@tanstack/react-router";
import { isLocale, type Locale } from "./locales";
import { localeFromPathname, withLocale } from "./path";

function pathnameOf(href: string): string {
  if (!href) return "/";
  try {
    return new URL(href, "https://sverko.ru").pathname;
  } catch {
    return href.split("?")[0]?.split("#")[0] || "/";
  }
}

/** Язык из публичного адреса. Внутренний pathname приставки не содержит. */
export function useLocale(): Locale {
  const publicHref = useRouterState({ select: (state) => state.location.publicHref });
  return localeFromPathname(pathnameOf(publicHref));
}

export function localeFromMatches(matches: Array<{ context?: unknown }>): Locale {
  for (const match of matches) {
    const locale = (match.context as { locale?: unknown } | undefined)?.locale;
    if (typeof locale === "string" && isLocale(locale)) return locale;
  }
  return "ru";
}

export function useLocalePath() {
  const locale = useLocale();
  return (path: string) => withLocale(locale, path);
}
