import { isPrefixedLocale, type Locale } from "./locales";

const PREFIX_RE = /^\/(en|de|fr|it|es|tr|pl|pt|nl|zh|ru)(?=\/|$)/;

/** Убирает языковую приставку. `/en/audits` и `/ru/audits` становятся `/audits`. */
export function stripLocalePrefix(pathname: string): string {
  const bare = pathname.replace(PREFIX_RE, "");
  return bare === "" ? "/" : bare;
}

export function localeFromPathname(pathname: string): Locale {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (segment === "ru") return "ru";
  return isPrefixedLocale(segment) ? segment : "ru";
}

/** Публичный адрес: русский без приставки, остальные с `/en` и т.д. */
export function withLocale(locale: Locale, path: string): string {
  const hashAt = path.indexOf("#");
  const hash = hashAt >= 0 ? path.slice(hashAt) : "";
  const noHash = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const queryAt = noHash.indexOf("?");
  const search = queryAt >= 0 ? noHash.slice(queryAt) : "";
  let pathname = queryAt >= 0 ? noHash.slice(0, queryAt) : noHash;
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  const bare = stripLocalePrefix(pathname);
  if (locale === "ru") return `${bare}${search}${hash}`;
  if (bare === "/") return `/${locale}${search}${hash}`;
  return `/${locale}${bare}${search}${hash}`;
}
