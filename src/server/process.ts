import { createHash } from "node:crypto";
import os from "node:os";
import {
  appendCheck,
  checkCount,
  documentBuffers,
  keepPreviousResult,
  markFailed,
  markReprocessing,
  pendingSessionIds,
  readSession,
  saveDocumentRead,
  saveOutcome,
  setStage,
} from "./db";
import { readFile, validateFile } from "./extract/index";
import { aiConfig } from "./env";
import { evidenceFromFragment } from "./evidence";
import { classifyLabels, compareLinkedValues, refineWithModel, reviewPackWithModel, scanPackForDiscrepancies, scanPackInTwoStages, shownStatus, type PackFinding } from "./llm";
import { createLimiter, workerCount } from "./pool";
import type { PreparedDoc, RoleHints } from "./reconcile";
import type { AuditNotice, CheckResult, CheckStatus } from "@/types/audit";
import { reconcile, unknownLabels, withoutDuplicates } from "./reconcile";

const cores = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
const sessionLimit = createLimiter(workerCount("SVERKO_SESSION_CONCURRENCY", Math.min(4, Math.max(2, cores))));
const readLimit = createLimiter(workerCount("SVERKO_READ_CONCURRENCY", Math.min(4, Math.max(2, cores))));

const jobs = new Map<string, Promise<void>>();

function track(sessionId: string, job: Promise<void>): Promise<void> {
  const tracked = job.finally(() => {
    if (jobs.get(sessionId) === tracked) jobs.delete(sessionId);
  });
  jobs.set(sessionId, tracked);
  return tracked;
}

export function enqueue(sessionId: string): Promise<void> {
  const current = jobs.get(sessionId);
  if (current) return current;
  return track(
    sessionId,
    sessionLimit(async () => {
      if ((await checkCount(sessionId)) > 0) return;
      const session = await readSession(sessionId);
      if (!session || session.processingStage === "failed") return;
      await processSession(sessionId);
    }).catch(async (error: unknown) => {
      console.error(error);
      await markFailed(sessionId, "Обработка прервалась из-за внутренней ошибки сервера. Загрузите комплект ещё раз.", []);
    }),
  );
}

const rebuildQueued = new Map<string, Promise<void>>();

/** Runs the analysis again after the current pass, including documents added meanwhile. */
export function enqueueRebuild(sessionId: string): Promise<void> {
  const previous = jobs.get(sessionId) ?? Promise.resolve();
  let queued: () => void = () => undefined;
  const visible = new Promise<void>((resolve) => {
    queued = resolve;
  });
  rebuildQueued.set(sessionId, visible);
  void markReprocessing(sessionId).then(queued, queued);
  return track(
    sessionId,
    previous
      .catch(() => undefined)
      .then(() =>
        sessionLimit(async () => {
          await markReprocessing(sessionId);
          await processSession(sessionId, true);
        }),
      )
      .catch(async (error: unknown) => {
        queued();
        console.error(error);
        if ((await checkCount(sessionId)) > 0) {
          await keepPreviousResult(sessionId, "Не удалось пересчитать проверку с новыми документами. Прежний результат сохранён.");
          return;
        }
        await markFailed(sessionId, "Обработка прервалась из-за внутренней ошибки сервера. Загрузите комплект ещё раз.", []);
      }),
  );
}

/** Resolves once a rebuild has been marked queued, before the heavy pass finishes. */
export function whenRebuildQueued(sessionId: string): Promise<void> {
  return rebuildQueued.get(sessionId) ?? Promise.resolve();
}

export function resumePending(): void {
  void pendingSessionIds()
    .then((ids) => {
      for (const id of ids) void enqueue(id);
    })
    .catch((error: unknown) => {
      console.error(error);
    });
}

export async function processSession(sessionId: string, replace = false): Promise<void> {
  if (!replace && (await checkCount(sessionId)) > 0) return;
  const existing = await readSession(sessionId);
  if (!existing || (!replace && existing.processingStage === "failed")) return;
  const files = await documentBuffers(sessionId);
  const reportFile = files.find((file) => file.row.role === "report");
  if (!reportFile) {
    await markFailed(sessionId, "В проверке нет основного отчёта.", []);
    return;
  }
  await setStage(sessionId, "reading");
  const fileErrors: { fileName: string; reason: string }[] = [];
  let reportDoc: PreparedDoc;
  try {
    reportDoc = await readLimit(() => readOne(reportFile.row.id, reportFile.row.name, reportFile.buffer, reportFile.row.sha256, true));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "не удалось прочитать отчёт";
    fileErrors.push({ fileName: reportFile.row.name, reason });
    await saveDocumentRead({ id: reportFile.row.id, pageCount: 0, readError: reason, preview: { kind: "none", reason } });
    await markFailed(sessionId, `Не удалось прочитать отчёт «${reportFile.row.name}»: ${reason}`, fileErrors);
    return;
  }

  await setStage(sessionId, "extracting");
  const supportingFiles = files.filter((item) => item.row.role === "supporting");
  const supporting = (
    await Promise.all(
      supportingFiles.map((file) =>
        readLimit(async () => {
          try {
            return await readOne(file.row.id, file.row.name, file.buffer, file.row.sha256, false);
          } catch (error) {
            const reason = error instanceof Error ? error.message : "не удалось прочитать файл";
            fileErrors.push({ fileName: file.row.name, reason });
            await saveDocumentRead({ id: file.row.id, pageCount: 0, readError: reason, preview: { kind: "none", reason } });
            return null;
          }
        }),
      ),
    )
  ).filter((doc): doc is PreparedDoc => doc != null);

  await setStage(sessionId, "matching");
  const separated = withoutDuplicates(reportDoc, supporting);
  const docs = [reportDoc, ...separated.unique];
  const modelNotices: AuditNotice[] = [];
  const config = aiConfig();
  let checks: CheckResult[] = [];
  // A non-empty two-stage scan is the result. Rules run when the key is missing, the model fails, or the scan returns nothing.
  if (config) {
    try {
      const scan = await scanPackInTwoStages(reportDoc, separated.unique);
      checks = findingsToChecks(scan.findings, docs);
      if (checks.length) checks = withOmitted(checks, reportDoc, separated.unique, fileErrors);
      if (scan.truncated) modelNotices.push({ code: "context_truncated", kept: scan.kept, limit: scan.limit });
      if (checks.length) modelNotices.push({ code: "model_two_stage" });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "нет ответа";
      modelNotices.push({ code: "model_failed", reason });
    }
  }
  if (!checks.length) checks = await ruleChecks(reportDoc, separated.unique, fileErrors, modelNotices);
  if (!checks.length) {
    await markFailed(
      sessionId,
      `Не удалось выделить показатели из отчёта «${reportFile.row.name}». Пустой результат не трактуется как «без замечаний».`,
      fileErrors,
    );
    return;
  }
  const notices: AuditNotice[] = [
    ...modelNotices,
    ...separated.duplicates.map((doc) => ({ code: "duplicate_file" as const, name: doc.name })),
  ];
  if (fileErrors.length) notices.unshift({ code: "partial_read" });
  if (!replace && (await checkCount(sessionId)) > 0) return;
  await saveOutcome({
    sessionId,
    reportDocumentId: reportFile.row.id,
    checks,
    fileErrors,
    notices,
    incomplete: fileErrors.length > 0 || notices.some((notice) => notice.code === "context_truncated") || supporting.some((doc) => doc.read.warnings.length > 0),
  });
}

async function ruleChecks(reportDoc: PreparedDoc, supporting: PreparedDoc[], fileErrors: { fileName: string; reason: string }[], notices: AuditNotice[]): Promise<CheckResult[]> {
  let hints: RoleHints = new Map();
  const config = aiConfig();
  const unknown = config ? unknownLabels([reportDoc, ...supporting]) : [];
  if (config && unknown.length) {
    try {
      hints = await classifyLabels(config, unknown);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "нет ответа";
      notices.push({ code: "labels_failed", reason });
    }
  }
  let checks = reconcile(reportDoc, supporting, fileErrors, hints);
  try {
    checks = await refineWithModel(checks, reportDoc, supporting);
    const reviewed = await reviewPackWithModel(checks, reportDoc, supporting);
    checks = reviewed.checks;
    if (reviewed.truncated) notices.push({ code: "context_truncated", kept: reviewed.kept, limit: reviewed.limit });
  } catch {
    // Rules stay in place when the model is unavailable.
  }
  return checks;
}

function indicatorKey(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/[«»"'.,]/g, "").replace(/\s+/g, " ").trim();
}

function sameIndicator(left: string, right: string): boolean {
  const a = indicatorKey(left);
  const b = indicatorKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 8 && b.length >= 8 && (a.includes(b) || b.includes(a));
}

/** Rows the model never named stay visible, but only as manual review. */
function withOmitted(checks: CheckResult[], report: PreparedDoc, supporting: PreparedDoc[], fileErrors: { fileName: string; reason: string }[]): CheckResult[] {
  const added = reconcile(report, supporting, fileErrors).flatMap((rule) => {
    if (checks.some((check) => sameIndicator(check.fieldName, rule.fieldName))) return [];
    const row: CheckResult = {
      ...rule,
      id: `omitted-${rule.id}`,
      status: "needs_review",
      severity: "medium",
      discrepancy: null,
      explanation: [{ code: "model_omitted", label: rule.fieldName }],
    };
    return [row];
  });
  return [...checks, ...added];
}

function findingsToChecks(findings: PackFinding[], docs: PreparedDoc[]): CheckResult[] {
  const reportId = docs[0]?.id ?? "";
  return findings.map((finding, index) => {
    const proposed: CheckStatus = finding.relation === "same" ? "match" : finding.relation === "different" ? "mismatch" : finding.relation === "unclear" || finding.relation === "insufficient" ? "needs_review" : "not_found";
    const status = shownStatus(finding.reportValue, finding.sourceValue || null, proposed);
    const compared = status === "match" || status === "mismatch" ? compareLinkedValues(finding.reportValue, finding.sourceValue) : null;
    const discrepancy = status === "mismatch" ? (compared?.discrepancy ?? null) : null;
    const evidence = finding.sources.filter((source) => source.quoteFound).map((source) => evidenceFromFragment(docs, source.fragmentId, source.quote, source.where));
    const reportReference = evidenceFromFragment(docs, finding.reportFragmentId, finding.reportQuote || finding.reportValue, finding.reportWhere);
    if (!reportReference.documentId) reportReference.documentId = reportId;
    return {
      id: `c${index + 1}`,
      fieldName: finding.name,
      reportValue: finding.reportValue,
      sourceValue: finding.sourceValue || null,
      discrepancy,
      status,
      severity: status === "mismatch" ? "high" : status === "match" ? "low" : "medium",
      explanation: finding.relation === "insufficient"
        ? [{ code: "insufficient", name: finding.name }]
        : finding.calculation
          ? [{ code: "calculated", formula: finding.calculation, total: finding.sourceValue, report: finding.reportValue, ...(discrepancy ? { difference: discrepancy } : {}) }]
          : finding.sourceCount
            ? [{ code: "cited", name: finding.name, count: finding.sourceCount }]
            : [{ code: "cite_missing", name: finding.name }],
      evidenceReferences: evidence,
      reportReference,
      reviewerStatus: "pending",
      reviewerComment: "",
    };
  });
}

async function readOne(id: string, name: string, buffer: Buffer, sha256Value: string, isReport: boolean): Promise<PreparedDoc> {
  const problem = validateFile(name, buffer, isReport ? "report" : "supporting");
  if (problem) throw new Error(problem);
  const read = await readFile(name, buffer);
  await saveDocumentRead({ id, pageCount: read.pageCount, preview: read.preview });
  return { id, name, sha256: sha256Value, read, isReport };
}

/** Looks up one indicator the reviewer selected after the automatic pass. Does not change existing checks. */
export async function findSelectedIndicator(sessionId: string, text: string, anchor: string | null): Promise<CheckResult> {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < 1 || trimmed.length > 180) throw new Error("Выделите короткий фрагмент показателя");
  const files = await documentBuffers(sessionId);
  const reportFile = files.find((file) => file.row.role === "report");
  if (!reportFile) throw new Error("В проверке нет отчёта");
  const report = await prepareQuiet(reportFile.row.id, reportFile.row.name, reportFile.buffer, reportFile.row.sha256, true);
  const supporting: PreparedDoc[] = [];
  for (const file of files) {
    if (file.row.role !== "supporting") continue;
    try {
      supporting.push(await prepareQuiet(file.row.id, file.row.name, file.buffer, file.row.sha256, false));
    } catch {
      // One unreadable file does not block the search through the rest.
    }
  }
  const scan = await scanPackForDiscrepancies(report, supporting, "", [{ name: trimmed, value: trimmed }]);
  const findings = scan.findings;
  const finding = findings.find((item) => item.name === trimmed) ?? findings[0];
  const proposed: CheckStatus = finding?.relation === "same" ? "match" : finding?.relation === "different" ? "mismatch" : finding?.relation === "unclear" ? "needs_review" : "not_found";
  const status = shownStatus(trimmed, finding?.sourceValue || null, proposed);
  const compared = finding && (status === "match" || status === "mismatch") ? compareLinkedValues(trimmed, finding.sourceValue) : null;
  const docs = [report, ...supporting];
  const evidence = (finding?.sources ?? []).filter((source) => source.quoteFound).map((source) => evidenceFromFragment(docs, source.fragmentId, source.quote, source.where));
  const check: CheckResult = {
    id: `user-${crypto.randomUUID()}`,
    fieldName: trimmed,
    reportValue: trimmed,
    sourceValue: finding?.sourceValue || null,
    discrepancy: compared?.discrepancy ?? null,
    status,
    severity: status === "mismatch" ? "high" : status === "match" ? "low" : "medium",
    explanation: finding?.sourceCount
      ? [{ code: "selected_found", text: trimmed, count: finding.sourceCount }]
      : [{ code: "selected_missing", text: trimmed }],
    evidenceReferences: evidence,
    reportReference: anchor ? evidenceFromFragment(docs, `${report.id}:${anchor}`, trimmed) : { documentId: report.id, pageNumber: 0, sourceText: trimmed },
    reviewerStatus: "pending",
    reviewerComment: "",
  };
  await appendCheck(sessionId, check);
  return check;
}

async function prepareQuiet(id: string, name: string, buffer: Buffer, sha256Value: string, isReport: boolean): Promise<PreparedDoc> {
  const problem = validateFile(name, buffer, isReport ? "report" : "supporting");
  if (problem) throw new Error(problem);
  return { id, name, sha256: sha256Value, read: await readFile(name, buffer), isReport };
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
