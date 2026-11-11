import type { EvidenceReference } from "@/types/audit";
import type { PreparedDoc } from "./reconcile";

/** Copies the page and box the extractor stored for a fragment id. A quote alone never invents a box. */
export function evidenceFromFragment(docs: PreparedDoc[], fragmentId: string, quote: string, fallbackWhere = ""): EvidenceReference {
  const cut = fragmentId.indexOf(":");
  const documentId = cut > 0 ? fragmentId.slice(0, cut) : fragmentId;
  const fragmentKey = cut > 0 ? fragmentId.slice(cut + 1) : "";
  const doc = docs.find((item) => item.id === documentId);
  const fragment = fragmentKey ? doc?.read.fragments.find((item) => item.id === fragmentKey || item.anchor === fragmentKey) : undefined;
  const anchor = fragment?.anchor || fragmentKey;
  const locationLabel = fragment?.locationLabel || fallbackWhere;
  return {
    documentId,
    pageNumber: fragment?.pageNumber ?? 0,
    sourceText: quote.slice(0, 240),
    ...(anchor ? { locationInDocument: anchor } : {}),
    ...(locationLabel ? { locationLabel } : {}),
    ...(fragment?.box ? { box: fragment.box } : {}),
  };
}
