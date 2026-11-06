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

function summarize(c: CheckResult): string {
  switch (c.status) {
    case "mismatch":
      return `Значение в отчёте (${c.reportValue}) не совпадает с первичным документом (${c.sourceValue})${c.discrepancy ? `, расхождение ${c.discrepancy}` : ""}.`;
    case "not_found":
      return `Подтверждающий документ для значения ${c.reportValue} не найден.`;
    case "needs_review":
      return "Автоматическая проверка не дала однозначного результата, требуется ручная проверка.";
    default:
      return "Совпадает.";
  }
}

export function buildFindings(checks: CheckResult[], documents: AuditDocument[]): Finding[] {
  const name = (id: string) => documents.find((d) => d.id === id)?.name ?? id;
  return checks.filter(isIssue).map((c) => ({
    checkId: c.id,
    fieldName: c.fieldName,
    reportValue: c.reportValue,
    sourceValue: c.sourceValue,
    status: c.status,
    severity: c.severity,
    summary: summarize(c),
    evidence: c.evidenceReferences.map((e) => ({
      documentId: e.documentId,
      documentName: name(e.documentId),
      pageNumber: e.pageNumber,
    })),
    reviewerStatus: c.reviewerStatus,
    reviewerComment: c.reviewerComment,
  }));
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function buildConclusionText(session: AuditSession, stats: ConclusionStats, findings: Finding[], rec: Recommendation): string {
  const reportName = lower(session.title.replace(/^Проверка\s+/i, ""));
  const parts: string[] = [];
  parts.push(
    `По результатам проверки ${reportName} сопоставлено ${stats.total} показателей отчёта с первичными документами. Подтверждено ${stats.matched} из ${stats.total} показателей.`,
  );
  const mism = findings.filter((f) => f.status === "mismatch");
  const nf = findings.filter((f) => f.status === "not_found");
  const nr = findings.filter((f) => f.status === "needs_review");
  if (mism.length) {
    parts.push(
      `Выявлены расхождения между представленными показателями и первичными отчётными документами по следующим позициям: ${mism
        .map((f) => `«${lower(f.fieldName)}» (в отчёте ${f.reportValue}, в первичном документе ${f.sourceValue})`)
        .join("; ")}.`,
    );
  }
  if (nf.length) {
    parts.push(
      `Не найдено документальное подтверждение показателей: ${nf.map((f) => `«${lower(f.fieldName)}» (${f.reportValue})`).join(", ")}. Отсутствие подтверждения не означает ошибочность показателя, но требует представления подтверждающих документов.`,
    );
  }
  if (nr.length) {
    parts.push(`Требуют ручной проверки: ${nr.map((f) => `«${lower(f.fieldName)}»`).join(", ")}.`);
  }
  if (stats.unreviewed > 0) parts.push(`Не рассмотрено проверяющим замечаний: ${stats.unreviewed}.`);
  const recText: Record<Recommendation, string> = {
    revise: "Рекомендуется вернуть отчёт на доработку с устранением перечисленных замечаний.",
    manual_review: "Рекомендуется завершить ручную проверку спорных показателей до принятия решения по отчёту.",
    accept: "Существенных замечаний не выявлено. Отчёт рекомендуется принять.",
  };
  parts.push(recText[rec]);
  return parts.join(" ");
}

export function buildConclusion(session: AuditSession, documents: AuditDocument[]): AuditConclusion {
  const stats = computeStats(session.checks);
  const findings = buildFindings(session.checks, documents);
  const recommendation = computeRecommendation(session.checks);
  return {
    sessionId: session.id,
    recommendation,
    findings,
    stats,
    text: buildConclusionText(session, stats, findings, recommendation),
    reviewerDecision: session.reviewerDecision,
    reviewerComment: session.reviewerDecision?.comment ?? "",
  };
}
