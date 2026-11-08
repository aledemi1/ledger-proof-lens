import type { CheckStatus, DocumentType, Recommendation, Severity } from "@/types/audit";
import type { Copy } from "./copy";

export function statusText(t: Copy, status: CheckStatus): string {
  if (status === "not_found") return t.status.notFound;
  if (status === "needs_review") return t.status.needsReview;
  return t.status[status];
}

export function categoryText(t: Copy, status: CheckStatus): string {
  if (status === "not_found") return t.category.notFound;
  if (status === "needs_review") return t.category.needsReview;
  return t.category[status];
}

export function severityText(t: Copy, severity: Severity): string {
  return t.severity[severity];
}

export function recommendationText(t: Copy, rec: Recommendation): string {
  if (rec === "revise") return t.recommendation.revise;
  if (rec === "manual_review") return t.recommendation.manual;
  return t.recommendation.accept;
}

export function docText(t: Copy, type: DocumentType): string {
  return t.doc[type];
}
