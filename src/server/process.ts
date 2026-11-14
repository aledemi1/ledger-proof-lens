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
  saveSelection,
  setEstimate,
  setStage,
} from "./db";
import { readFile, validateFile } from "./extract/index";
import { aiConfig } from "./env";
import { evidenceFromFragment } from "./evidence";
import { classifyLabels, compareLinkedValues, listReportIndicators, refineWithModel, reviewPackWithModel, scanPackForDiscrepancies, scanPackInTwoStages, shownStatus, type PackFinding } from "./llm";
import { createLimiter, workerCount } from "./pool";
import type { PreparedDoc, RoleHints } from "./reconcile";
import type { AuditNotice, CheckResult, CheckStatus } from "@/types/audit";
import { reconcile, unknownLabels, withoutDuplicates } from "./reconcile";
import { indicatorPicks, reportRegions } from "./regions";
import { visualPagesOf, waitSeconds } from "../lib/waitEstimate";

const cores = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
const sessionLimit = createLimiter(workerCount("SVERKO_SESSION_CONCURRENCY", Math.min(4, Math.max(2, cores))));
const readLimit = createLimiter(workerCount("SVERKO_READ_CONCURRENCY", Math.min(4, Math.max(2, cores))));

const jobs = new Map<string, Promise<void>>();

interface HeldPack {
  reportId: string;
  reportName: string;
  report: PreparedDoc;
  unique: PreparedDoc[];
  duplicates: PreparedDoc[];
  fileErrors: { fileName: string; reason: string }[];
  textChars: number;
}

const heldPacks = new Map<string, { pack: HeldPack; timer: ReturnType<typeof setTimeout> }>();

function rememberPack(sessionId: string, pack: HeldPack): void {
  const previous = heldPacks.get(sessionId);
  if (previous) clearTimeout(previous.timer);
  const timer = setTimeout(() => heldPacks.delete(sessionId), 30 * 60 * 1000);
  if (typeof timer === "object" && timer && "unref" in timer) timer.unref();
  heldPacks.set(sessionId, { pack, timer });
}

function takePack(sessionId: string): HeldPack | undefined {
  const held = heldPacks.get(sessionId);
  if (!held) return undefined;
  clearTimeout(held.timer);
  heldPacks.delete(sessionId);
  return held.pack;
}

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
  if (existing.selection?.phase === "selecting") return;
  const held = existing.selection?.phase === "chosen" ? takePack(sessionId) : undefined;
  if (held) {
    const chosen = existing.selection?.chosen?.length ? existing.selection.chosen : undefined;
    await setEstimate(sessionId, waitSeconds({ pendingVisualPages: 0, pendingTextFiles: 0, textChars: held.textChars, model: Boolean(aiConfig()), queued: false }));
    await setStage(sessionId, "matching");
    await finishMatching(sessionId, held, chosen, replace);
    return;
  }
  const files = await documentBuffers(sessionId);
  const reportFile = files.find((file) => file.row.role === "report");
  if (!reportFile) {
    await markFailed(sessionId, "В проверке нет основного отчёта.", []);
    return;
  }
  await setStage(sessionId, "reading");
  const model = Boolean(aiConfig());
  await setEstimate(sessionId, waitSeconds({
    pendingVisualPages: files.reduce((sum, file) => sum + visualPagesOf(file.row.name, file.buffer.length), 0),
    pendingTextFiles: files.filter((file) => visualPagesOf(file.row.name, file.buffer.length) === 0).length,
    textChars: 0,
    model,
    queued: false,
  }));
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

  const separated = withoutDuplicates(reportDoc, supporting);
  const textChars = [reportDoc, ...supporting].reduce((sum, doc) => sum + doc.read.text.length, 0);
  await setEstimate(sessionId, waitSeconds({ pendingVisualPages: 0, pendingTextFiles: 0, textChars, model, queued: false }));
  const pack: HeldPack = {
    reportId: reportFile.row.id,
    reportName: reportFile.row.name,
    report: reportDoc,
    unique: separated.unique,
    duplicates: separated.duplicates,
    fileErrors,
    textChars,
  };
  if (existing.selection?.phase === "deferred") {
    rememberPack(sessionId, pack);
    const readPack = [reportDoc, ...supporting];
    await saveSelection(sessionId, {
      phase: "selecting",
      regions: reportRegions(reportDoc),
      ocrPages: readPack.reduce((sum, doc) => sum + (/\.(pdf|png|jpe?g)$/i.test(doc.name) ? Math.max(doc.read.pageCount, 1) : 0), 0),
      textChars,
    });
    await setStage(sessionId, "selecting");
    return;
  }
  await setStage(sessionId, "matching");
  const picked = existing.selection?.phase === "chosen" ? existing.selection.chosen : undefined;
  await finishMatching(sessionId, pack, picked?.length ? picked : undefined, replace);
}

async function finishMatching(sessionId: string, pack: HeldPack, chosen: { anchor?: string; name: string; value: string }[] | undefined, replace: boolean): Promise<void> {
  const reportDoc = pack.report;
  const supporting = pack.unique;
  const fileErrors = pack.fileErrors;
  const docs = [reportDoc, ...supporting];
  const modelNotices: AuditNotice[] = [];
  const config = aiConfig();
  let checks: CheckResult[] = [];
  // A non-empty two-stage scan is the result. Rules run when the key is missing, the model fails, or the scan returns nothing.
  if (config) {
    try {
      const scan = chosen
        ? await scanPackForDiscrepancies(reportDoc, supporting, "", chosen)
        : await scanPackInTwoStages(reportDoc, supporting);
      checks = findingsToChecks(scan.findings, docs);
      if (checks.length && !chosen) checks = withOmitted(checks, reportDoc, supporting, fileErrors);
      if (scan.truncated) modelNotices.push({ code: "context_truncated", kept: scan.kept, limit: scan.limit });
      if (checks.length) modelNotices.push({ code: "model_two_stage" });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "нет ответа";
      modelNotices.push({ code: "model_failed", reason });
    }
  }
  if (!checks.length) {
    const ruled = await ruleChecks(reportDoc, supporting, fileErrors, modelNotices);
    checks = chosen ? ruled.filter((check) => chosen.some((item) => item.value.replace(/\s+/g, "") === check.reportValue.replace(/\s+/g, ""))) : ruled;
  }
  if (!checks.length) {
    await markFailed(
      sessionId,
      `Не удалось выделить показатели из отчёта «${pack.reportName}». Пустой результат не трактуется как «без замечаний».`,
      fileErrors,
    );
    return;
  }
  const notices: AuditNotice[] = [
    ...modelNotices,
    ...pack.duplicates.map((doc) => ({ code: "duplicate_file" as const, name: doc.name })),
  ];
  if (fileErrors.length) notices.unshift({ code: "partial_read" });
  if (!replace && (await checkCount(sessionId)) > 0) return;
  await saveOutcome({
    sessionId,
    reportDocumentId: pack.reportId,
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

/** Marks the values the person kept and starts the reconciliation. Null means the model may choose. */
export async function chooseSelection(
  sessionId: string,
  ids: string[] | null,
  items?: { anchor: string; name: string; value: string }[],
): Promise<void> {
  const session = await readSession(sessionId);
  if (!session?.selection || session.selection.phase !== "selecting") throw new Error("Сначала дождитесь, пока отчёт будет прочитан");
  const fromItems = items?.length ? await chosenFromReport(sessionId, items) : [];
  const chosen = fromItems.length
    ? fromItems
    : ids
      ? session.selection.regions.filter((region) => ids.includes(region.id)).map((region) => ({ name: region.name, value: region.value }))
      : [];
  if ((items?.length || ids) && !chosen.length) throw new Error("Выберите хотя бы одно значение");
  const next = { ...session.selection, phase: "chosen" as const, ...(chosen.length ? { chosen } : {}) };
  await saveSelection(sessionId, next);
  await setEstimate(sessionId, waitSeconds({ pendingVisualPages: 0, pendingTextFiles: 0, textChars: session.selection.textChars, model: Boolean(aiConfig()), queued: false }));
  await setStage(sessionId, "queued");
  void enqueue(sessionId);
}

/** Asks the model which report values are worth checking. A missed answer stays empty: rules do not fill in row numbers. */
export async function suggestSelection(sessionId: string): Promise<{ anchor: string; name: string; value: string }[]> {
  const session = await readSession(sessionId);
  if (!session?.selection || session.selection.phase !== "selecting") throw new Error("Сначала дождитесь, пока отчёт будет прочитан");
  const report = await reportDocOf(sessionId);
  if (!aiConfig()) return [];
  try {
    const indicators = await listReportIndicators(report);
    return indicatorPicks(
      report.read.fragments.map((fragment) => ({ id: `${report.id}:${fragment.id}`, anchor: fragment.anchor, text: fragment.text })),
      indicators,
    );
  } catch {
    return [];
  }
}

async function reportDocOf(sessionId: string): Promise<PreparedDoc> {
  const held = heldPacks.get(sessionId)?.pack.report;
  if (held) return held;
  const files = await documentBuffers(sessionId);
  const reportFile = files.find((file) => file.row.role === "report");
  if (!reportFile) throw new Error("В проверке нет основного отчёта");
  return readOne(reportFile.row.id, reportFile.row.name, reportFile.buffer, reportFile.row.sha256, true);
}

async function chosenFromReport(sessionId: string, items: { anchor: string; name: string; value: string }[]): Promise<{ anchor: string; name: string; value: string }[]> {
  const report = await reportDocOf(sessionId);
  const byAnchor = new Map(report.read.fragments.map((fragment) => [fragment.anchor, fragment.text.replace(/\s+/g, " ").trim()]));
  return items.flatMap((item) => {
    const text = byAnchor.get(item.anchor);
    if (!text) return [];
    const name = item.name.replace(/\s+/g, " ").trim();
    return [{ anchor: item.anchor, name: name || text, value: text }];
  });
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
