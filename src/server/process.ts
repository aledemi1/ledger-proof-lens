import { createHash } from "node:crypto";
import os from "node:os";
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
import { readFile, validateFile } from "./extract/index";
import { aiConfig } from "./env";
import { classifyLabels, refineWithModel, reviewPackWithModel } from "./llm";
import { createLimiter, workerCount } from "./pool";
import type { PreparedDoc, RoleHints } from "./reconcile";
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
    await markFailed(
      sessionId,
      `Не удалось выделить показатели из отчёта «${reportFile.row.name}». Пустой результат не трактуется как «без замечаний».`,
      fileErrors,
    );
    return;
  }
  try {
    checks = await refineWithModel(checks, reportDoc, supporting);
    checks = await reviewPackWithModel(checks, reportDoc, supporting);
  } catch {
    // Rules stay in place when the model is unavailable.
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

async function readOne(id: string, name: string, buffer: Buffer, sha256Value: string, isReport: boolean): Promise<PreparedDoc> {
  const problem = validateFile(name, buffer, isReport ? "report" : "supporting");
  if (problem) throw new Error(problem);
  const read = await readFile(name, buffer);
  await saveDocumentRead({ id, pageCount: read.pageCount, preview: read.preview });
  return { id, name, sha256: sha256Value, read, isReport };
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
