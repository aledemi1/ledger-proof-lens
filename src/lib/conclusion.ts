import { fill } from "@/i18n/fill";
import { formatExplanation, statusExplanation } from "@/lib/explanations";
import type { Locale } from "@/i18n/locales";
import { copy } from "@/i18n/messages";
import type {
  AuditConclusion,
  AuditDocument,
  AuditSession,
  CheckResult,
  ConclusionStats,
  Finding,
  Recommendation,
} from "@/types/audit";

export const isIssue = (c: CheckResult) => c.status !== "match";

export function computeStats(checks: CheckResult[]): ConclusionStats {
  return {
    total: checks.length,
    matched: checks.filter((c) => c.status === "match").length,
    mismatches: checks.filter((c) => c.status === "mismatch").length,
    notFound: checks.filter((c) => c.status === "not_found").length,
    needsReview: checks.filter((c) => c.status === "needs_review").length,
    unreviewed: checks.filter((c) => isIssue(c) && c.reviewerStatus === "pending").length,
  };
}

/**
 * System recommendation. Based only on automatic results; reviewer verdicts never
 * turn a mismatch into a match, but a mismatch/missing evidence the reviewer marked
 * as "verified" (with a comment) no longer blocks acceptance.
 */
export function computeRecommendation(checks: CheckResult[]): Recommendation {
  const blocking = checks.filter(
    (c) => (c.status === "mismatch" || c.status === "not_found") && c.reviewerStatus !== "verified",
  );
  if (blocking.length > 0) return "revise";
  const open = checks.filter((c) => c.status === "needs_review" && c.reviewerStatus === "pending");
  if (open.length > 0) return "manual_review";
  return "accept";
}

export function buildFindings(checks: CheckResult[], documents: AuditDocument[], locale: Locale = "ru"): Finding[] {
  const name = (id: string) => documents.find((d) => d.id === id)?.name ?? id;
  return checks.filter(isIssue).map((c) => ({
    checkId: c.id,
    fieldName: c.fieldName,
    reportValue: c.reportValue,
    sourceValue: c.sourceValue,
    status: c.status,
    severity: c.severity,
    summary: formatExplanation(c.explanation, locale) || statusExplanation(c, locale),
    evidence: c.evidenceReferences.map((e) => ({
      documentId: e.documentId,
      documentName: name(e.documentId),
      pageNumber: e.pageNumber,
      ...(e.locationLabel ? { locationLabel: e.locationLabel } : {}),
    })),
    reviewerStatus: c.reviewerStatus,
    reviewerComment: c.reviewerComment,
  }));
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function buildConclusionText(session: AuditSession, stats: ConclusionStats, findings: Finding[], rec: Recommendation, locale: Locale = "ru"): string {
  const t = copy[locale].conclusion;
  const reportName = lower(session.title.replace(/^Проверка\s+/i, ""));
  const parts: string[] = [];
  parts.push(fill(t.textIntro, { name: reportName, total: stats.total, matched: stats.matched }));
  const mism = findings.filter((f) => f.status === "mismatch");
  const nf = findings.filter((f) => f.status === "not_found");
  const nr = findings.filter((f) => f.status === "needs_review");
  if (mism.length) parts.push(fill(t.textMismatch, { n: mism.length }));
  if (nf.length) parts.push(fill(t.textMissing, { n: nf.length }));
  if (nr.length) parts.push(fill(t.textManual, { n: nr.length }));
  if (stats.unreviewed > 0) parts.push(fill(t.textUnreviewed, { n: stats.unreviewed }));
  const recText: Record<Recommendation, string> = { revise: t.recRevise, manual_review: t.recManual, accept: t.recAccept };
  parts.push(recText[rec]);
  return parts.join(" ");
}

export function buildConclusion(session: AuditSession, documents: AuditDocument[], locale: Locale = "ru"): AuditConclusion {
  const stats = computeStats(session.checks);
  const findings = buildFindings(session.checks, documents, locale);
  const recommendation = computeRecommendation(session.checks);
  return {
    sessionId: session.id,
    recommendation,
    findings,
    stats,
    text: buildConclusionText(session, stats, findings, recommendation, locale),
    reviewerDecision: session.reviewerDecision,
    reviewerComment: session.reviewerDecision?.comment ?? "",
  };
}
