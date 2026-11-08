import type { Locale } from "@/i18n/locales";
import type { AuditDocument, AuditSession } from "@/types/audit";
import { realisticDocuments, realisticSession } from "./realisticDemo";

export interface DemoPack {
  documents: AuditDocument[];
  session: AuditSession;
}

const loaders: Partial<Record<Locale, () => Promise<{ default: DemoPack }>>> = {
  en: () => import("./demo-locales/en.json") as Promise<{ default: DemoPack }>,
  de: () => import("./demo-locales/de.json") as Promise<{ default: DemoPack }>,
  fr: () => import("./demo-locales/fr.json") as Promise<{ default: DemoPack }>,
  it: () => import("./demo-locales/it.json") as Promise<{ default: DemoPack }>,
  es: () => import("./demo-locales/es.json") as Promise<{ default: DemoPack }>,
  tr: () => import("./demo-locales/tr.json") as Promise<{ default: DemoPack }>,
  pl: () => import("./demo-locales/pl.json") as Promise<{ default: DemoPack }>,
  pt: () => import("./demo-locales/pt.json") as Promise<{ default: DemoPack }>,
  nl: () => import("./demo-locales/nl.json") as Promise<{ default: DemoPack }>,
  zh: () => import("./demo-locales/zh.json") as Promise<{ default: DemoPack }>,
};

const cache = new Map<Locale, DemoPack>();

export async function loadDemoPack(locale: Locale): Promise<DemoPack> {
  if (locale === "ru") return { documents: realisticDocuments, session: realisticSession };
  const cached = cache.get(locale);
  if (cached) return cached;
  const load = loaders[locale];
  if (!load) return { documents: realisticDocuments, session: realisticSession };
  try {
    const pack = (await load()).default;
    cache.set(locale, pack);
    return pack;
  } catch {
    return { documents: realisticDocuments, session: realisticSession };
  }
}
