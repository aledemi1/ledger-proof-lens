import { randomBytes } from "node:crypto";
import { mailConfigured } from "../mail";
import fs from "node:fs";
import path from "node:path";
import { appendNote } from "../../lib/explanations";
import type { CheckResult, Decision, DocumentType, EvidenceReference, ReviewerStatus } from "@/types/audit";
import {
  AccountError,
  accountFromToken,
  changePassword,
  closeAuthSession,
  confirmEmail,
  createAccount,
  listAccounts,
  loginAccount,
  normalizeEmail,
  openAuthSession,
  sendRegistrationEmail,
  setAccountRole,
  type Account,
  type AccountRole,
} from "../accounts";
import {
  clearReviews,
  deleteSession,
  saveSessionText,
  findByIdempotency,
  insertDocument,
  insertSession,
  listAllIds,
  listOwnedIds,
  readDocumentBytes,
  readDocuments,
  readSession,
  saveDecision,
  saveReview,
  sessionOwner,
  setReportDocument,
} from "../db";
import { loadEnv } from "../env";
import { InboxError, listInbox, readInbox } from "../inbox";
import { adminStats, get, run } from "../store";
import { fileExtension, validateFile } from "../extract/index";
import { dataDir } from "../paths";
import { formatSigned, parseMoney, parseQuantity } from "../values";
import * as XLSX from "xlsx";
import { chooseSelection, enqueue, enqueueRebuild, findSelectedIndicator, sha256, suggestSelection, whenRebuildQueued } from "../process";
import { saveSelection } from "../db";
import { canRead } from "./access";
import { asType, json, mimeOf, readJson } from "./respond";

export async function auditsApi(request: Request, parts: string[], user: Account): Promise<Response> {
  if (parts.length === 2 && request.method === "GET") {
    const ids = user.role === "admin" ? await listAllIds() : await listOwnedIds(user.id);
    const sessions = (await Promise.all(ids.map((id) => readSession(id)))).filter((session) => session != null);
    return json(sessions, 200);
  }
  if (parts.length === 2 && request.method === "POST") return createAudit(request, user);
  const id = parts[2];
  if (!id || !(await canRead(id, user))) {
    if (parts.length >= 3) return json({ error: "Проверка не найдена" }, 404);
  }
  if (!id) return json({ error: "Не найдено" }, 404);

  if (parts.length === 3 && request.method === "GET") {
    const session = await readSession(id);
    return session ? json(session, 200) : json({ error: "Проверка не найдена" }, 404);
  }
  if (parts.length === 3 && request.method === "PATCH") return updateSessionText(request, id);
  if (parts.length === 3 && request.method === "DELETE") {
    await deleteSession(id);
    return json({ ok: true }, 200);
  }
  if (parts[3] === "selection" && parts[4] === "suggest" && request.method === "POST") {
    try {
      return json({ items: await suggestSelection(id) }, 200);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Не удалось выбрать показатели" }, 400);
    }
  }
  if (parts[3] === "selection" && request.method === "POST") {
    const body = (await request.json().catch(() => null)) as { ids?: unknown; all?: unknown; items?: unknown } | null;
    const ids = Array.isArray(body?.ids) ? body.ids.filter((item): item is string => typeof item === "string") : [];
    const items = Array.isArray(body?.items) ? body.items.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const anchor = typeof row["anchor"] === "string" ? row["anchor"] : "";
      const name = typeof row["name"] === "string" ? row["name"] : "";
      const value = typeof row["value"] === "string" ? row["value"] : "";
      return anchor && value ? [{ anchor, name, value }] : [];
    }) : [];
    try {
      await chooseSelection(id, body?.all === true ? null : ids, items);
      return json(await readSession(id), 200);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Не удалось начать сверку" }, 400);
    }
  }
  if (parts[3] === "documents" && request.method === "GET") return json(await readDocuments(id), 200);
  if (parts[3] === "documents" && request.method === "POST") return addDocuments(request, id);
  if (parts[3] === "files" && parts[4] && request.method === "GET") return fileResponse(id, parts[4], request);
  if (parts[3] === "checks" && parts[4] && parts[5] === "review" && request.method === "POST") return review(request, id, parts[4]);
  if (parts[3] === "checks" && parts[4] && parts[5] === "report-value" && request.method === "POST") return reviseReport(request, id, parts[4]);
  if (parts[3] === "indicators" && request.method === "POST") return addIndicator(request, id);
  if (parts[3] === "decision" && request.method === "POST") return decision(request, id);
  if (parts[3] === "reviews" && parts[4] === "reset" && request.method === "POST") {
    await clearReviews(id);
    return json(await readSession(id), 200);
  }
  return json({ error: "Не найдено" }, 404);
}

async function updateSessionText(request: Request, id: string): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { title?: unknown; description?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!title) return json({ error: "Укажите название проверки" }, 400);
  await saveSessionText(id, title, description);
  return json(await readSession(id), 200);
}

export async function createAudit(request: Request, user: Account): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Ожидалась форма с файлами" }, 400);
  }
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const idempotencyKey = String(form.get("idempotencyKey") ?? "").trim();
  const requestedPrevious = String(form.get("previousSessionId") ?? "").trim();
  const previousOwner = requestedPrevious ? await sessionOwner(requestedPrevious) : null;
  const previousSessionId = previousOwner === user.id ? requestedPrevious : undefined;
  if (!title) return json({ error: "Укажите название проверки" }, 400);
  if (!idempotencyKey) return json({ error: "Не передан ключ запроса" }, 400);
  const existing = await findByIdempotency(user.id, idempotencyKey);
  if (existing) {
    void enqueue(existing);
    return json(await readSession(existing), 200);
  }
  const report = form.get("report");
  if (!(report instanceof File)) return json({ error: "Приложите основной отчёт" }, 400);
  const supporting = form.getAll("supporting").filter((item): item is File => item instanceof File);
  if (!supporting.length) return json({ error: "Приложите хотя бы один подтверждающий документ" }, 400);
  let hinted: string[] = [];
  try {
    const raw = form.get("supportingTypes");
    hinted = raw ? (JSON.parse(String(raw)) as string[]) : [];
  } catch {
    hinted = [];
  }
  const files: { file: File; role: "report" | "supporting"; type: DocumentType }[] = [
    { file: report, role: "report", type: "report" },
    ...supporting.map((file, index) => ({ file, role: "supporting" as const, type: asType(hinted[index], file.name) })),
  ];
  const errors: { fileName: string; reason: string }[] = [];
  const buffers = new Map<File, Buffer>();
  for (const item of files) {
    const buffer = Buffer.from(await item.file.arrayBuffer());
    buffers.set(item.file, buffer);
    const reason = validateFile(item.file.name || "файл", buffer, item.role);
    if (reason) errors.push({ fileName: item.file.name || "файл", reason });
  }
  if (errors.length) return json({ error: "Файлы не приняты", files: errors }, 400);

  const sessionId = `aud_${randomBytes(8).toString("hex")}`;
  await insertSession({ id: sessionId, owner: user.id, idempotencyKey, title, ...(description ? { description } : {}), ...(previousSessionId ? { previousSessionId } : {}) });
  const folder = path.join(dataDir(), "files", sessionId);
  fs.mkdirSync(folder, { recursive: true });
  let reportId = "";
  for (const item of files) {
    const buffer = buffers.get(item.file);
    if (!buffer) continue;
    const documentId = `doc_${randomBytes(8).toString("hex")}`;
    if (item.role === "report") reportId = documentId;
    const storagePath = path.join(folder, documentId);
    fs.writeFileSync(storagePath, buffer);
    await insertDocument({
      id: documentId,
      sessionId,
      role: item.role,
      name: item.file.name || documentId,
      docType: item.type,
      mimeType: item.file.type || mimeOf(item.file.name),
      size: buffer.length,
      sha256: sha256(buffer),
      storagePath,
      body: buffer,
    });
  }
  await setReportDocument(sessionId, reportId);
  if (form.get("deferSelection") === "1") {
    await saveSelection(sessionId, { phase: "deferred", regions: [], ocrPages: 0, textChars: 0 });
  }
  void enqueue(sessionId);
  return json(await readSession(sessionId), 201);
}

export async function addDocuments(request: Request, sessionId: string): Promise<Response> {
  const session = await readSession(sessionId);
  if (!session) return json({ error: "Проверка не найдена" }, 404);
  if (!session.reportDocumentId) return json({ error: "В проверке нет основного отчёта" }, 400);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Ожидалась форма с файлами" }, 400);
  }
  const supporting = form.getAll("supporting").filter((item): item is File => item instanceof File);
  if (!supporting.length) return json({ error: "Приложите хотя бы один подтверждающий документ" }, 400);
  let hinted: string[] = [];
  try {
    const raw = form.get("supportingTypes");
    hinted = raw ? (JSON.parse(String(raw)) as string[]) : [];
  } catch {
    hinted = [];
  }
  const errors: { fileName: string; reason: string }[] = [];
  const accepted: { file: File; buffer: Buffer; type: DocumentType }[] = [];
  for (const [index, file] of supporting.entries()) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const reason = validateFile(file.name || "файл", buffer, "supporting");
    if (reason) errors.push({ fileName: file.name || "файл", reason });
    else accepted.push({ file, buffer, type: asType(hinted[index], file.name) });
  }
  if (errors.length) return json({ error: "Файлы не приняты", files: errors }, 400);
  const folder = path.join(dataDir(), "files", sessionId);
  fs.mkdirSync(folder, { recursive: true });
  for (const item of accepted) {
    const documentId = `doc_${randomBytes(8).toString("hex")}`;
    const storagePath = path.join(folder, documentId);
    fs.writeFileSync(storagePath, item.buffer);
    await insertDocument({
      id: documentId,
      sessionId,
      role: "supporting",
      name: item.file.name || documentId,
      docType: item.type,
      mimeType: item.file.type || mimeOf(item.file.name),
      size: item.buffer.length,
      sha256: sha256(item.buffer),
      storagePath,
      body: item.buffer,
    });
  }
  const job = enqueueRebuild(sessionId);
  await whenRebuildQueued(sessionId);
  void job;
  return json(await readSession(sessionId), 200);
}

export async function addIndicator(request: Request, sessionId: string): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { text?: unknown; anchor?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  const anchor = typeof body?.anchor === "string" && body.anchor.trim() ? body.anchor.trim() : null;
  try {
    return json(await findSelectedIndicator(sessionId, text, anchor), 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось проверить показатель";
    return json({ error: message }, 400);
  }
}

export async function review(request: Request, sessionId: string, checkId: string): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { reviewerStatus?: ReviewerStatus; reviewerComment?: string; reviewerSource?: EvidenceReference | null } | null;
  if (!body) return json({ error: "Некорректный запрос" }, 400);
  const session = await readSession(sessionId);
  const current = session?.checks.find((check) => check.id === checkId);
  if (!current) return json({ error: "Показатель не найден" }, 404);
  const status = body.reviewerStatus ?? current.reviewerStatus;
  const comment = (body.reviewerComment ?? current.reviewerComment).trim();
  if (status === "verified" && current.status !== "match" && !comment) {
    return json({ error: "Чтобы снять замечание, укажите причину" }, 400);
  }
  const source = Object.prototype.hasOwnProperty.call(body, "reviewerSource") ? (body.reviewerSource ?? null) : undefined;
  await saveReview(sessionId, checkId, status, comment, source);
  const updated = (await readSession(sessionId))?.checks.find((check) => check.id === checkId);
  return json(updated, 200);
}

export async function decision(request: Request, sessionId: string): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { decision?: Decision | null; comment?: string } | null;
  if (!body) return json({ error: "Некорректный запрос" }, 400);
  const value = body.decision ?? null;
  if (value && value !== "accept" && value !== "revise") return json({ error: "Неизвестное решение" }, 400);
  await saveDecision(sessionId, value, (body.comment ?? "").trim());
  return json(await readSession(sessionId), 200);
}

export async function reviseReport(request: Request, sessionId: string, checkId: string): Promise<Response> {
  const body = await readJson<{ value?: string }>(request);
  const value = body?.value?.trim() ?? "";
  if (!value) return json({ error: "Введите значение" }, 400);
  const row = await get<{ payload: string }>("SELECT payload FROM checks WHERE session_id = ? AND id = ?", [sessionId, checkId]);
  if (!row) return json({ error: "Показатель не найден" }, 404);
  const stored = JSON.parse(row.payload) as CheckResult;
  const next = revisedCheck(stored, value);
  await run("UPDATE checks SET payload = ? WHERE session_id = ? AND id = ?", [JSON.stringify(next), sessionId, checkId]);
  const updated = (await readSession(sessionId))?.checks.find((check) => check.id === checkId);
  return json(updated ?? next, 200);
}

export function revisedCheck(check: CheckResult, value: string): CheckResult {
  const next: CheckResult = { ...check, reportValue: value, reportEdited: true };
  const left = parseMoney(value) ?? parseQuantity(value)?.minor ?? null;
  const right = check.sourceValue ? parseMoney(check.sourceValue) ?? parseQuantity(check.sourceValue)?.minor ?? null : null;
  if (left == null || right == null) {
    next.status = "needs_review";
    next.discrepancy = null;
    next.explanation = appendNote(check.explanation, { code: "edited_unparsed", value });
    return next;
  }
  const same = left === right;
  const suffix = parseMoney(value) != null || parseMoney(check.sourceValue ?? "") != null ? "₽" : check.unit ?? "";
  next.status = same ? "match" : "mismatch";
  next.discrepancy = same ? null : formatSigned(left - right, suffix);
  next.explanation = same
    ? [{ code: "edited_match", value }]
    : [{ code: "edited_diff", value, source: check.sourceValue ?? "", ...(next.discrepancy ? { delta: next.discrepancy } : {}) }];
  return next;
}

export async function fileResponse(sessionId: string, documentId: string, request: Request): Promise<Response> {
  if (!/^doc_[a-f0-9]+$/.test(documentId)) return json({ error: "Документ не найден" }, 404);
  const file = await readDocumentBytes(sessionId, documentId);
  if (!file) return json({ error: "Документ не найден" }, 404);
  let data = file.bytes;
  const revised = new URL(request.url).searchParams.get("revised") === "1";
  let name = file.name;
  if (revised && file.name.toLowerCase().endsWith(".xlsx")) {
    const session = await readSession(sessionId);
    data = applyReportEdits(data, session?.checks ?? []);
    name = file.name.replace(/\.xlsx$/i, " — правки.xlsx");
  }
  const headers = new Headers({
    "Content-Type": file.mimeType || "application/octet-stream",
    "Content-Disposition": `${revised ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  return new Response(new Uint8Array(data), { status: 200, headers });
}

export function applyReportEdits(buffer: Buffer, checks: CheckResult[]): Buffer {
  const book = XLSX.read(buffer, { type: "buffer", cellDates: false });
  for (const check of checks) {
    if (!check.reportEdited) continue;
    const label = check.reportReference?.locationLabel ?? "";
    const address = label.match(/ячейка\s+([A-Z]+\d+)/i)?.[1];
    const sheetName = label.match(/Лист «([^»]+)»/)?.[1];
    if (!address || !sheetName || !book.Sheets[sheetName]) continue;
    const normalized = check.reportValue.replace(/\s/g, "").replace(",", ".");
    const numeric = Number(normalized);
    book.Sheets[sheetName][address] = Number.isFinite(numeric) ? { t: "n", v: numeric } : { t: "s", v: check.reportValue };
  }
  return Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
}
