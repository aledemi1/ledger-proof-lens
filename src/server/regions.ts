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

export function regionIdsFor(regions: ReportRegion[], indicators: { name: string; value: string }[]): string[] {
  const wanted = indicators.map((item) => item.value.replace(/\s+/g, "").toLowerCase()).filter((value) => value.length >= 2);
  return regions.filter((region) => {
    const value = region.value.replace(/\s+/g, "").toLowerCase();
    return wanted.some((item) => item.includes(value) || value.includes(item));
  }).map((region) => region.id);
}
