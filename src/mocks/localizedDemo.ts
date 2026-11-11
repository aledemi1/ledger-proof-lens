import type { Locale } from "@/i18n/locales";
import { parseNotices } from "@/lib/notices";
import type { AuditDocument, AuditSession } from "@/types/audit";
import { realisticDocuments, realisticSession } from "./realisticDemo";

export interface DemoPack {
  documents: AuditDocument[];
  session: AuditSession;
}

const loaders: Partial<Record<Locale, () => Promise<{ default: DemoPack }>>> = {
  en: () => import("./demo-locales/en.json") as unknown as Promise<{ default: DemoPack }>,
  de: () => import("./demo-locales/de.json") as unknown as Promise<{ default: DemoPack }>,
  fr: () => import("./demo-locales/fr.json") as unknown as Promise<{ default: DemoPack }>,
  it: () => import("./demo-locales/it.json") as unknown as Promise<{ default: DemoPack }>,
  es: () => import("./demo-locales/es.json") as unknown as Promise<{ default: DemoPack }>,
  tr: () => import("./demo-locales/tr.json") as unknown as Promise<{ default: DemoPack }>,
  pl: () => import("./demo-locales/pl.json") as unknown as Promise<{ default: DemoPack }>,
  pt: () => import("./demo-locales/pt.json") as unknown as Promise<{ default: DemoPack }>,
  nl: () => import("./demo-locales/nl.json") as unknown as Promise<{ default: DemoPack }>,
  zh: () => import("./demo-locales/zh.json") as unknown as Promise<{ default: DemoPack }>,
};

function withNotices(pack: DemoPack): DemoPack {
  return { ...pack, session: { ...pack.session, notices: parseNotices(pack.session.notices) } };
}

const cache = new Map<Locale, DemoPack>();

export async function loadDemoPack(locale: Locale): Promise<DemoPack> {
  if (locale === "ru") return withNotices({ documents: realisticDocuments, session: realisticSession });
  const cached = cache.get(locale);
  if (cached) return cached;
  const load = loaders[locale];
  if (!load) return withNotices({ documents: realisticDocuments, session: realisticSession });
  try {
    const pack = withNotices((await load()).default);
    cache.set(locale, pack);
    return pack;
  } catch {
    return withNotices({ documents: realisticDocuments, session: realisticSession });
  }
}
