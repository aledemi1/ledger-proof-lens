import type { ReportRegion } from "@/types/audit";
import type { PreparedDoc } from "./reconcile";
import { parseDate, parseMoney, parseQuantity } from "./values";

export type { ReportRegion };

/** Values the person can tick on the report. A box is included only when extraction measured one. */
export function reportRegions(doc: PreparedDoc): ReportRegion[] {
  const regions: ReportRegion[] = [];
  const seen = new Set<string>();
  for (const fragment of doc.read.fragments) {
    const text = fragment.text.replace(/\s+/g, " ").trim();
    if (text.length < 1 || text.length > 180) continue;
    if (parseMoney(text) == null && !parseDate(text) && !parseQuantity(text)) continue;
    const key = `${fragment.pageNumber}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    regions.push({
      id: fragment.id,
      name: text,
      value: text,
      pageNumber: fragment.pageNumber,
      anchor: fragment.anchor,
      ...(fragment.box ? { box: fragment.box } : {}),
    });
    if (regions.length >= 80) break;
  }
  return regions;
}

/** A cell that is only a short integer, such as a table's own row number. */
export function bareRowIndex(text: string): boolean {
  return /^\d{1,3}$/.test(text.trim());
}

/**
 * Keeps the fragments the model actually cited. A short row number is kept only
 * when the model gave it a name made of words, not the number itself.
 */
export function indicatorPicks(
  fragments: { id: string; anchor: string; text: string }[],
  indicators: { name: string; value: string; fragmentId: string }[],
): { anchor: string; name: string; value: string }[] {
  const byId = new Map(fragments.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const picks: { anchor: string; name: string; value: string }[] = [];
  for (const indicator of indicators) {
    const fragment = byId.get(indicator.fragmentId);
    if (!fragment || seen.has(fragment.anchor)) continue;
    const text = fragment.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const name = indicator.name.replace(/\s+/g, " ").trim();
    if (bareRowIndex(text) && !/\p{L}/u.test(name)) continue;
    seen.add(fragment.anchor);
    picks.push({ anchor: fragment.anchor, name: name || text, value: text });
  }
  return picks;
}
