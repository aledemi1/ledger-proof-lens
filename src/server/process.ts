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
import { classifyLabels, compareLinkedValues, refineWithModel, reviewPackWithModel, scanPackForDiscrepancies, scanPackInTwoStages, type PackFinding } from "./llm";
import { createLimiter, workerCount } from "./pool";
import type { PreparedDoc, RoleHints } from "./reconcile";
import type { CheckResult, CheckStatus } from "@/types/audit";
import { duplicateNames, reconcile, unknownLabels } from "./reconcile";

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
  const modelNotices: string[] = [];
  const config = aiConfig();
  let checks: CheckResult[] = [];
  if (config) {
    try {
      checks = findingsToChecks(await scanPackInTwoStages(reportDoc, supporting), reportDoc.id);
      if (checks.length) modelNotices.push("Показатели сначала выделены по одному отчёту, затем сверены с первичными документами. Статус посчитан по цитатам, которые есть в файлах.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "нет ответа";
      modelNotices.push(`Полный просмотр не выполнен (${reason}). Результат посчитан правилами.`);
    }
  }
  if (!checks.length) checks = await ruleChecks(reportDoc, supporting, fileErrors, modelNotices);
  if (!checks.length) {
    await markFailed(
      sessionId,
      `Не удалось выделить показатели из отчёта «${reportFile.row.name}». Пустой результат не трактуется как «без замечаний».`,
      fileErrors,
    );
    return;
  }
  const notices = [
    ...modelNotices,
    ...duplicateNames(reportDoc, supporting).map((name) => `«${name}» повторяет уже учтённый файл и не увеличивает суммы.`),
  ];
  if (fileErrors.length) notices.unshift("Проверка неполная: часть подтверждающих файлов не прочитана. Найденные результаты сохранены.");
  if (!replace && (await checkCount(sessionId)) > 0) return;
  await saveOutcome({
    sessionId,
    reportDocumentId: reportFile.row.id,
    checks,
    fileErrors,
    notices,
    incomplete: fileErrors.length > 0 || supporting.some((doc) => doc.read.warnings.length > 0),
  });
}

async function ruleChecks(reportDoc: PreparedDoc, supporting: PreparedDoc[], fileErrors: { fileName: string; reason: string }[], notices: string[]): Promise<CheckResult[]> {
  let hints: RoleHints = new Map();
  const config = aiConfig();
  const unknown = config ? unknownLabels([reportDoc, ...supporting]) : [];
  if (config && unknown.length) {
    try {
      hints = await classifyLabels(config, unknown);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "нет ответа";
      notices.push(`Языковая модель не ответила (${reason}). Незнакомые подписи оставлены на ручную проверку.`);
    }
  }
  let checks = reconcile(reportDoc, supporting, fileErrors, hints);
  try {
    checks = await refineWithModel(checks, reportDoc, supporting);
    checks = await reviewPackWithModel(checks, reportDoc, supporting);
  } catch {
    // Rules stay in place when the model is unavailable.
  }
  return checks;
}

function findingsToChecks(findings: PackFinding[], reportId: string): CheckResult[] {
  return findings.map((finding, index) => {
    const status: CheckStatus = finding.relation === "same" ? "match" : finding.relation === "different" ? "mismatch" : finding.relation === "unclear" ? "needs_review" : "not_found";
    const compared = status === "match" || status === "mismatch" ? compareLinkedValues(finding.reportValue, finding.sourceValue) : null;
    const evidence = finding.sources.filter((source) => source.quoteFound).map((source) => {
      const cut = source.fragmentId.indexOf(":");
      return {
        documentId: cut > 0 ? source.fragmentId.slice(0, cut) : source.fragmentId,
        pageNumber: 0,
        sourceText: source.quote.slice(0, 240),
        ...(cut > 0 ? { locationInDocument: source.fragmentId.slice(cut + 1) } : {}),
        ...(source.where ? { locationLabel: source.where } : {}),
      };
    });
    const reportCut = finding.reportFragmentId.indexOf(":");
    return {
      id: `c${index + 1}`,
      fieldName: finding.name,
      reportValue: finding.reportValue,
      sourceValue: finding.sourceValue || null,
      discrepancy: status === "mismatch" ? (compared?.discrepancy ?? null) : null,
      status,
      severity: status === "mismatch" ? "high" : status === "match" ? "low" : "medium",
      explanation: finding.sourceCount
        ? `Сервер сверил «${finding.name}» с ${finding.sourceCount} цитатами из первичных документов.`
        : `Для «${finding.name}» в первичных документах не найдена цитата, которая есть в указанном фрагменте.`,
      evidenceReferences: evidence,
      reportReference: {
        documentId: reportCut > 0 ? finding.reportFragmentId.slice(0, reportCut) : reportId,
        pageNumber: 0,
        sourceText: (finding.reportQuote || finding.reportValue).slice(0, 240),
        ...(reportCut > 0 ? { locationInDocument: finding.reportFragmentId.slice(reportCut + 1) } : {}),
        ...(finding.reportWhere ? { locationLabel: finding.reportWhere } : {}),
      },
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
  const findings = await scanPackForDiscrepancies(report, supporting, "", [{ name: trimmed, value: trimmed }]);
  const finding = findings.find((item) => item.name === trimmed) ?? findings[0];
  const status: CheckStatus = finding?.relation === "same" ? "match" : finding?.relation === "different" ? "mismatch" : finding?.relation === "unclear" ? "needs_review" : "not_found";
  const compared = finding && (status === "match" || status === "mismatch") ? compareLinkedValues(trimmed, finding.sourceValue) : null;
  const evidence = (finding?.sources ?? []).filter((source) => source.quoteFound).map((source) => {
    const cut = source.fragmentId.indexOf(":");
    return {
      documentId: cut > 0 ? source.fragmentId.slice(0, cut) : source.fragmentId,
      pageNumber: 0,
      sourceText: source.quote.slice(0, 240),
      ...(cut > 0 ? { locationInDocument: source.fragmentId.slice(cut + 1) } : {}),
      ...(source.where ? { locationLabel: source.where } : {}),
    };
  });
  const check: CheckResult = {
    id: `user-${crypto.randomUUID()}`,
    fieldName: trimmed,
    reportValue: trimmed,
    sourceValue: finding?.sourceValue || null,
    discrepancy: compared?.discrepancy ?? null,
    status,
    severity: status === "mismatch" ? "high" : status === "match" ? "low" : "medium",
    explanation: finding?.sourceCount
      ? `Проверяющий выделил «${trimmed}» после разбора. Сервер нашёл ${finding.sourceCount} источников и сверил их с выделенным текстом.`
      : `Проверяющий выделил «${trimmed}» после разбора. В первичных документах подтверждение не найдено.`,
    evidenceReferences: evidence,
    reportReference: { documentId: report.id, pageNumber: 0, sourceText: trimmed, ...(anchor ? { locationInDocument: anchor } : {}) },
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
