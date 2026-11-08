import { useLocale } from "./use-locale";
import type { Locale } from "./locales";
import type { Copy } from "./copy";
import { de } from "./messages/de";
import { en } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";
import { it } from "./messages/it";
import { nl } from "./messages/nl";
import { pl } from "./messages/pl";
import { pt } from "./messages/pt";
import { ru } from "./messages/ru";
import { tr } from "./messages/tr";
import { zh } from "./messages/zh";

export const copy: Record<Locale, Copy> = { ru, en, de, fr, it, es, tr, pl, pt, nl, zh };

export function useCopy(): Copy {
  return copy[useLocale()];
}
