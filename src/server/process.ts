import { createHash } from "node:crypto";
import {
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
import { readFile } from "./extract/index";
import { validateFile } from "./extract/index";
import { aiConfig } from "./env";
import { classifyLabels, refineWithModel } from "./llm";
import type { PreparedDoc, RoleHints } from "./reconcile";
import { duplicateNames, reconcile, unknownLabels } from "./reconcile";

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
  if (checkCount(sessionId) > 0) return Promise.resolve();
  const session = readSession(sessionId);
  if (!session || session.processingStage === "failed") return Promise.resolve();
  return track(
    sessionId,
    processSession(sessionId).catch((error: unknown) => {
      console.error(error);
      markFailed(sessionId, "Обработка прервалась из-за внутренней ошибки сервера. Загрузите комплект ещё раз.", []);
    }),
  );
}

/** Runs the analysis again after the current pass, including documents added meanwhile. */
export function enqueueRebuild(sessionId: string): Promise<void> {
  markReprocessing(sessionId);
  const previous = jobs.get(sessionId) ?? Promise.resolve();
  return track(
    sessionId,
    previous.catch(() => undefined).then(() => {
      markReprocessing(sessionId);
      return processSession(sessionId, true);
    }).catch((error: unknown) => {
      console.error(error);
      if (checkCount(sessionId) > 0) {
        keepPreviousResult(sessionId, "Не удалось пересчитать проверку с новыми документами. Прежний результат сохранён.");
        return;
      }
      markFailed(sessionId, "Обработка прервалась из-за внутренней ошибки сервера. Загрузите комплект ещё раз.", []);
    }),
  );
}

export function resumePending(): void {
  for (const id of pendingSessionIds()) enqueue(id);
}

export async function processSession(sessionId: string, replace = false): Promise<void> {
  if (!replace && checkCount(sessionId) > 0) return;
  const existing = readSession(sessionId);
  if (!existing || (!replace && existing.processingStage === "failed")) return;
  const files = documentBuffers(sessionId);
  const reportFile = files.find((file) => file.row.role === "report");
  if (!reportFile) {
    markFailed(sessionId, "В проверке нет основного отчёта.", []);
    return;
  }
  setStage(sessionId, "reading");
  const fileErrors: { fileName: string; reason: string }[] = [];
  let reportDoc: PreparedDoc;
  try {
    reportDoc = await readOne(reportFile.row.id, reportFile.row.name, reportFile.buffer, reportFile.row.sha256, true);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "не удалось прочитать отчёт";
    fileErrors.push({ fileName: reportFile.row.name, reason });
    saveDocumentRead({ id: reportFile.row.id, pageCount: 0, readError: reason, preview: { kind: "none", reason } });
    markFailed(sessionId, `Не удалось прочитать отчёт «${reportFile.row.name}»: ${reason}`, fileErrors);
    return;
  }

  setStage(sessionId, "extracting");
  const supporting: PreparedDoc[] = [];
  for (const file of files.filter((item) => item.row.role === "supporting")) {
    try {
      supporting.push(await readOne(file.row.id, file.row.name, file.buffer, file.row.sha256, false));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "не удалось прочитать файл";
      fileErrors.push({ fileName: file.row.name, reason });
      saveDocumentRead({ id: file.row.id, pageCount: 0, readError: reason, preview: { kind: "none", reason } });
    }
  }

  setStage(sessionId, "matching");
  const modelNotices: string[] = [];
  let hints: RoleHints = new Map();
  const config = aiConfig();
  const unknown = config ? unknownLabels([reportDoc, ...supporting]) : [];
  if (config && unknown.length) {
    try {
      hints = await classifyLabels(config, unknown);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "нет ответа";
      modelNotices.push(`Языковая модель не ответила (${reason}). Незнакомые подписи оставлены на ручную проверку.`);
    }
  }
  let checks = reconcile(reportDoc, supporting, fileErrors, hints);
  if (!checks.length) {
    markFailed(
      sessionId,
      `Не удалось выделить показатели из отчёта «${reportFile.row.name}». Пустой результат не трактуется как «без замечаний».`,
      fileErrors,
    );
    return;
  }
  try {
    checks = await refineWithModel(checks, reportDoc, supporting);
  } catch {
    // Rules stay in place when the model is unavailable.
  }
  const notices = [
    ...modelNotices,
    ...duplicateNames(reportDoc, supporting).map((name) => `«${name}» повторяет уже учтённый файл и не увеличивает суммы.`),
  ];
  if (fileErrors.length) notices.unshift("Проверка неполная: часть подтверждающих файлов не прочитана. Найденные результаты сохранены.");
  if (!replace && checkCount(sessionId) > 0) return;
  saveOutcome({
    sessionId,
    reportDocumentId: reportFile.row.id,
    checks,
    fileErrors,
    notices,
    incomplete: fileErrors.length > 0 || supporting.some((doc) => doc.read.warnings.length > 0),
  });
}

async function readOne(id: string, name: string, buffer: Buffer, sha256: string, isReport: boolean): Promise<PreparedDoc> {
  const problem = validateFile(name, buffer, isReport ? "report" : "supporting");
  if (problem) throw new Error(problem);
  const read = await readFile(name, buffer);
  saveDocumentRead({ id, pageCount: read.pageCount, preview: read.preview });
  return { id, name, sha256, read, isReport };
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
