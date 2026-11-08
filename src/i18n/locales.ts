export const LOCALES = ["ru", "en", "de", "fr", "it", "es", "tr", "pl", "pt", "nl", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

/** Языки с приставкой в адресе. Русский остаётся на корневом пути. */
export const PREFIXED_LOCALES = ["en", "de", "fr", "it", "es", "tr", "pl", "pt", "nl", "zh"] as const;
export type PrefixedLocale = (typeof PREFIXED_LOCALES)[number];

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function isPrefixedLocale(value: string | undefined | null): value is PrefixedLocale {
  return !!value && (PREFIXED_LOCALES as readonly string[]).includes(value);
}

export const LOCALE_HTML_LANG: Record<Locale, string> = {
  ru: "ru",
  en: "en",
  de: "de",
  fr: "fr",
  it: "it",
  es: "es",
  tr: "tr",
  pl: "pl",
  pt: "pt",
  nl: "nl",
  zh: "zh-CN",
};

export const LOCALE_INTL: Record<Locale, string> = {
  ru: "ru-RU",
  en: "en-GB",
  de: "de-DE",
  fr: "fr-FR",
  it: "it-IT",
  es: "es-ES",
  tr: "tr-TR",
  pl: "pl-PL",
  pt: "pt-BR",
  nl: "nl-NL",
  zh: "zh-CN",
};

/** Название языка на нём самом. */
export const LOCALE_NAME: Record<Locale, string> = {
  ru: "Русский",
  en: "English",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
  es: "Español",
  tr: "Türkçe",
  pl: "Polski",
  pt: "Português",
  nl: "Nederlands",
  zh: "中文",
};

export const LOCALE_REGION: Record<Locale, string> = {
  ru: "Россия",
  en: "International",
  de: "Deutschland",
  fr: "France",
  it: "Italia",
  es: "España",
  tr: "Türkiye",
  pl: "Polska",
  pt: "Portugal / Brasil",
  nl: "Nederland",
  zh: "中国",
};
