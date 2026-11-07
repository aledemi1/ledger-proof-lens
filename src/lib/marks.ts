import type { CheckResult, CheckStatus, EvidenceBox, EvidenceReference } from "@/types/audit";

/** A spot in a document that belongs to a check. Built only from references the extractor produced. */
export interface DocMark {
  checkId: string;
  status: CheckStatus;
  anchor?: string;
  page: number;
  box?: EvidenceBox;
}

export const statusOrder: CheckStatus[] = ["mismatch", "not_found", "needs_review", "match"];
const rank = (status: CheckStatus) => statusOrder.indexOf(status);

/** Marks for one document. When several checks share an anchor, the most serious one wins. */
export function marksFor(documentId: string, checks: CheckResult[], isReport: boolean): DocMark[] {
  const byKey = new Map<string, DocMark>();
  for (const check of checks) {
    const refs: EvidenceReference[] = isReport
      ? check.reportReference ? [check.reportReference] : []
      : check.evidenceReferences;
    for (const ref of refs) {
      if (ref.documentId !== documentId || !ref.locationInDocument) continue;
      const key = ref.locationInDocument;
      const current = byKey.get(key);
      if (current && rank(current.status) <= rank(check.status)) continue;
      const mark: DocMark = { checkId: check.id, status: check.status, anchor: key, page: ref.pageNumber };
      if (ref.box) mark.box = ref.box;
      byKey.set(key, mark);
    }
  }
  return [...byKey.values()];
}

export function countByStatus(checks: CheckResult[]): Record<CheckStatus, number> {
  const counts: Record<CheckStatus, number> = { mismatch: 0, not_found: 0, needs_review: 0, match: 0 };
  checks.forEach((check) => (counts[check.status] += 1));
  return counts;
}
