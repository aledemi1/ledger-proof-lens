import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Decision, DocumentType, EvidenceReference, ReviewerStatus } from "@/types/audit";
import {
  clearReviews,
  deleteSession,
  findByIdempotency,
  insertDocument,
  insertSession,
  listOwnedIds,
  readDocumentFile,
  readDocuments,
  readSession,
  saveDecision,
  saveReview,
  sessionOwner,
  setReportDocument,
} from "./db";
import { loadEnv } from "./env";
import { fileExtension, validateFile } from "./extract/index";
import { dataDir } from "./paths";
import { enqueue, enqueueRebuild, sha256 } from "./process";

const TYPES = new Set(["unknown", "act", "invoice", "waybill", "contract", "payment", "other", "report"]);

export async function handleApi(request: Request): Promise<Response> {
  loadEnv();
  const url = new URL(request.url);
  const { owner, cookie } = identity(request);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "audits") return json({ error: "Не найдено" }, 404, cookie);

  if (parts.length === 2 && request.method === "GET") {
    const sessions = listOwnedIds(owner).map((id) => readSession(id)).filter((session) => session != null);
    return json(sessions, 200, cookie);
  }
  if (parts.length === 2 && request.method === "POST") return createAudit(request, owner, cookie);
  const id = parts[2];
  if (!id || !owned(id, owner)) {
    if (parts.length >= 3) return json({ error: "Проверка не найдена" }, 404, cookie);
  }
  if (!id) return json({ error: "Не найдено" }, 404, cookie);

  if (parts.length === 3 && request.method === "GET") {
    const session = readSession(id);
    return session ? json(session, 200, cookie) : json({ error: "Проверка не найдена" }, 404, cookie);
  }
  if (parts.length === 3 && request.method === "DELETE") {
    deleteSession(id);
    return json({ ok: true }, 200, cookie);
  }
  if (parts[3] === "documents" && request.method === "GET") return json(readDocuments(id), 200, cookie);
  if (parts[3] === "documents" && request.method === "POST") return addDocuments(request, id, cookie);
  if (parts[3] === "files" && parts[4] && request.method === "GET") return fileResponse(id, parts[4], cookie);
  if (parts[3] === "checks" && parts[4] && parts[5] === "review" && request.method === "POST") return review(request, id, parts[4], cookie);
  if (parts[3] === "decision" && request.method === "POST") return decision(request, id, cookie);
  if (parts[3] === "reviews" && parts[4] === "reset" && request.method === "POST") {
    clearReviews(id);
    return json(readSession(id), 200, cookie);
  }
  return json({ error: "Не найдено" }, 404, cookie);
}

async function createAudit(request: Request, owner: string, cookie?: string): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Ожидалась форма с файлами" }, 400, cookie);
  }
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const idempotencyKey = String(form.get("idempotencyKey") ?? "").trim();
  const requestedPrevious = String(form.get("previousSessionId") ?? "").trim();
  const previousSessionId = requestedPrevious && sessionOwner(requestedPrevious) === owner ? requestedPrevious : undefined;
  if (!title) return json({ error: "Укажите название проверки" }, 400, cookie);
  if (!idempotencyKey) return json({ error: "Не передан ключ запроса" }, 400, cookie);
  const existing = findByIdempotency(owner, idempotencyKey);
  if (existing) {
    enqueue(existing);
    const session = readSession(existing);
    return json(session, 200, cookie);
  }
  const report = form.get("report");
  if (!(report instanceof File)) return json({ error: "Приложите основной отчёт" }, 400, cookie);
  const supporting = form.getAll("supporting").filter((item): item is File => item instanceof File);
  if (!supporting.length) return json({ error: "Приложите хотя бы один подтверждающий документ" }, 400, cookie);
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
  if (errors.length) return json({ error: "Файлы не приняты", files: errors }, 400, cookie);

  const sessionId = `aud_${randomBytes(8).toString("hex")}`;
  insertSession({ id: sessionId, owner, idempotencyKey, title, ...(description ? { description } : {}), ...(previousSessionId ? { previousSessionId } : {}) });
  const folder = path.join(dataDir(), "files", sessionId);
  fs.mkdirSync(folder, { recursive: true });
  let reportId = "";
  for (const item of files) {
    const buffer = buffers.get(item.file)!;
    const documentId = `doc_${randomBytes(8).toString("hex")}`;
    if (item.role === "report") reportId = documentId;
    const storagePath = path.join(folder, documentId);
    fs.writeFileSync(storagePath, buffer);
    insertDocument({
      id: documentId,
      sessionId,
      role: item.role,
      name: item.file.name || documentId,
      docType: item.type,
      mimeType: item.file.type || mimeOf(item.file.name),
      size: buffer.length,
      sha256: sha256(buffer),
      storagePath,
    });
  }
  setReportDocument(sessionId, reportId);
  enqueue(sessionId);
  return json(readSession(sessionId), 201, cookie);
}

async function addDocuments(request: Request, sessionId: string, cookie?: string): Promise<Response> {
  const session = readSession(sessionId);
  if (!session) return json({ error: "Проверка не найдена" }, 404, cookie);
  if (!session.reportDocumentId) return json({ error: "В проверке нет основного отчёта" }, 400, cookie);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Ожидалась форма с файлами" }, 400, cookie);
  }
  const supporting = form.getAll("supporting").filter((item): item is File => item instanceof File);
  if (!supporting.length) return json({ error: "Приложите хотя бы один подтверждающий документ" }, 400, cookie);
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
  if (errors.length) return json({ error: "Файлы не приняты", files: errors }, 400, cookie);
  const folder = path.join(dataDir(), "files", sessionId);
  fs.mkdirSync(folder, { recursive: true });
  for (const item of accepted) {
    const documentId = `doc_${randomBytes(8).toString("hex")}`;
    const storagePath = path.join(folder, documentId);
    fs.writeFileSync(storagePath, item.buffer);
    insertDocument({
      id: documentId,
      sessionId,
      role: "supporting",
      name: item.file.name || documentId,
      docType: item.type,
      mimeType: item.file.type || mimeOf(item.file.name),
      size: item.buffer.length,
      sha256: sha256(item.buffer),
      storagePath,
    });
  }
  enqueueRebuild(sessionId);
  return json(readSession(sessionId), 200, cookie);
}

async function review(request: Request, sessionId: string, checkId: string, cookie?: string): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { reviewerStatus?: ReviewerStatus; reviewerComment?: string; reviewerSource?: EvidenceReference | null } | null;
  if (!body) return json({ error: "Некорректный запрос" }, 400, cookie);
  const session = readSession(sessionId);
  const current = session?.checks.find((check) => check.id === checkId);
  if (!current) return json({ error: "Показатель не найден" }, 404, cookie);
  const status = body.reviewerStatus ?? current.reviewerStatus;
  const comment = (body.reviewerComment ?? current.reviewerComment).trim();
  if (status === "verified" && current.status !== "match" && !comment) {
    return json({ error: "Чтобы снять замечание, укажите причину" }, 400, cookie);
  }
  const source = Object.prototype.hasOwnProperty.call(body, "reviewerSource") ? (body.reviewerSource ?? null) : undefined;
  saveReview(sessionId, checkId, status, comment, source);
  const updated = readSession(sessionId)?.checks.find((check) => check.id === checkId);
  return json(updated, 200, cookie);
}

async function decision(request: Request, sessionId: string, cookie?: string): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { decision?: Decision | null; comment?: string } | null;
  if (!body) return json({ error: "Некорректный запрос" }, 400, cookie);
  const value = body.decision ?? null;
  if (value && value !== "accept" && value !== "revise") return json({ error: "Неизвестное решение" }, 400, cookie);
  saveDecision(sessionId, value, (body.comment ?? "").trim());
  return json(readSession(sessionId), 200, cookie);
}

function fileResponse(sessionId: string, documentId: string, cookie?: string): Response {
  if (!/^doc_[a-f0-9]+$/.test(documentId)) return json({ error: "Документ не найден" }, 404, cookie);
  const file = readDocumentFile(sessionId, documentId);
  if (!file || !fs.existsSync(file.path)) return json({ error: "Документ не найден" }, 404, cookie);
  const data = fs.readFileSync(file.path);
  const headers = new Headers({
    "Content-Type": file.mimeType || "application/octet-stream",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(new Uint8Array(data), { status: 200, headers });
}

function owned(id: string, owner: string): boolean {
  return sessionOwner(id) === owner;
}

function identity(request: Request): { owner: string; cookie?: string } {
  const current = cookieValue(request.headers.get("cookie"), "sverko_sid");
  if (current && /^[a-f0-9]{32}$/.test(current)) return { owner: current };
  const owner = randomBytes(16).toString("hex");
  const secure = request.headers.get("x-forwarded-proto") === "https" ? "; Secure" : "";
  return { owner, cookie: `sverko_sid=${owner}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}` };
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

function asType(value: string | undefined, filename: string): DocumentType {
  if (value && TYPES.has(value) && value !== "report") return value as DocumentType;
  const name = filename.toLowerCase();
  if (/наклад/.test(name)) return "waybill";
  if (/акт/.test(name)) return "act";
  if (/сч[её]т/.test(name)) return "invoice";
  if (/договор/.test(name)) return "contract";
  if (/плат/.test(name)) return "payment";
  return "unknown";
}

function mimeOf(name: string): string {
  const ext = fileExtension(name);
  const map: Record<string, string> = {
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    csv: "text/csv",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
  };
  return map[ext] ?? "application/octet-stream";
}

function json(payload: unknown, status: number, cookie?: string): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(payload), { status, headers });
}
