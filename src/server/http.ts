import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Decision, DocumentType, EvidenceReference, ReviewerStatus } from "@/types/audit";
import {
  AccountError,
  accountFromToken,
  changePassword,
  closeAuthSession,
  createAccount,
  listAccounts,
  loginAccount,
  normalizeEmail,
  openAuthSession,
  setAccountRole,
  type Account,
  type AccountRole,
} from "./accounts";
import {
  clearReviews,
  deleteSession,
  findByIdempotency,
  insertDocument,
  insertSession,
  listAllIds,
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
import { enqueue, enqueueRebuild, sha256, whenRebuildQueued } from "./process";

const TYPES = new Set(["unknown", "act", "invoice", "waybill", "contract", "payment", "other", "report"]);

export async function handleApi(request: Request): Promise<Response> {
  loadEnv();
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api") return json({ error: "Не найдено" }, 404);
  if (parts[1] === "auth") return authApi(request, parts);
  if (parts[1] === "admin") return adminApi(request, parts);
  if (parts[1] !== "audits") return json({ error: "Не найдено" }, 404);

  const user = await accountFromToken(cookieValue(request.headers.get("cookie"), "sverko_auth"));
  if (!user) return json({ error: "Войдите в аккаунт, чтобы открыть свои проверки" }, 401);
  return auditsApi(request, parts, user);
}

async function authApi(request: Request, parts: string[]): Promise<Response> {
  if (parts[2] === "register" && request.method === "POST") return register(request);
  if (parts[2] === "login" && request.method === "POST") return login(request);
  if (parts[2] === "logout" && request.method === "POST") return logout(request);
  if (parts[2] === "me" && request.method === "GET") {
    const user = await accountFromToken(cookieValue(request.headers.get("cookie"), "sverko_auth"));
    return user ? json(user, 200) : json({ error: "Войдите в аккаунт" }, 401);
  }
  if (parts[2] === "password" && request.method === "POST") return updatePassword(request);
  return json({ error: "Не найдено" }, 404);
}

async function register(request: Request): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string }>(request);
  if (!body) return json({ error: "Некорректный запрос" }, 400);
  try {
    const account = await createAccount(normalizeEmail(String(body.email ?? "")), String(body.password ?? ""), "user");
    const token = await openAuthSession(account.id);
    return json(account, 201, authCookie(token, request));
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.code === "duplicate" ? 409 : 400);
    throw error;
  }
}

async function login(request: Request): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string }>(request);
  if (!body) return json({ error: "Некорректный запрос" }, 400);
  const account = await loginAccount(normalizeEmail(String(body.email ?? "")), String(body.password ?? ""));
  if (!account) return json({ error: "Неверная почта или пароль" }, 401);
  const token = await openAuthSession(account.id);
  return json(account, 200, authCookie(token, request));
}

async function logout(request: Request): Promise<Response> {
  const token = cookieValue(request.headers.get("cookie"), "sverko_auth");
  await closeAuthSession(token);
  return json({ ok: true }, 200, "sverko_auth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

async function updatePassword(request: Request): Promise<Response> {
  const user = await accountFromToken(cookieValue(request.headers.get("cookie"), "sverko_auth"));
  if (!user) return json({ error: "Войдите в аккаунт" }, 401);
  const body = await readJson<{ currentPassword?: string; nextPassword?: string }>(request);
  if (!body) return json({ error: "Некорректный запрос" }, 400);
  try {
    await changePassword(user.id, String(body.currentPassword ?? ""), String(body.nextPassword ?? ""));
    return json({ ok: true }, 200);
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, 400);
    throw error;
  }
}

async function adminApi(request: Request, parts: string[]): Promise<Response> {
  const user = await accountFromToken(cookieValue(request.headers.get("cookie"), "sverko_auth"));
  if (!user) return json({ error: "Войдите в аккаунт" }, 401);
  if (user.role !== "admin") return json({ error: "Недостаточно прав" }, 403);
  if (parts[2] === "users" && parts.length === 3 && request.method === "GET") return json(await listAccounts(), 200);
  if (parts[2] === "users" && parts.length === 3 && request.method === "POST") return createUser(request);
  if (parts[2] === "users" && parts[3] && parts.length === 4 && request.method === "PATCH") return updateUser(request, parts[3]);
  return json({ error: "Не найдено" }, 404);
}

async function createUser(request: Request): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string; role?: AccountRole }>(request);
  if (!body) return json({ error: "Некорректный запрос" }, 400);
  const role = body.role === "admin" ? "admin" : "user";
  try {
    const account = await createAccount(normalizeEmail(String(body.email ?? "")), String(body.password ?? ""), role);
    return json(account, 201);
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.code === "duplicate" ? 409 : 400);
    throw error;
  }
}

async function updateUser(request: Request, id: string): Promise<Response> {
  const body = await readJson<{ role?: AccountRole }>(request);
  if (!body || (body.role !== "admin" && body.role !== "user")) return json({ error: "Укажите роль admin или user" }, 400);
  try {
    await setAccountRole(id, body.role);
    return json({ ok: true }, 200);
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.code === "missing" ? 404 : 409);
    throw error;
  }
}

async function auditsApi(request: Request, parts: string[], user: Account): Promise<Response> {
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
  if (parts.length === 3 && request.method === "DELETE") {
    await deleteSession(id);
    return json({ ok: true }, 200);
  }
  if (parts[3] === "documents" && request.method === "GET") return json(await readDocuments(id), 200);
  if (parts[3] === "documents" && request.method === "POST") return addDocuments(request, id);
  if (parts[3] === "files" && parts[4] && request.method === "GET") return fileResponse(id, parts[4]);
  if (parts[3] === "checks" && parts[4] && parts[5] === "review" && request.method === "POST") return review(request, id, parts[4]);
  if (parts[3] === "decision" && request.method === "POST") return decision(request, id);
  if (parts[3] === "reviews" && parts[4] === "reset" && request.method === "POST") {
    await clearReviews(id);
    return json(await readSession(id), 200);
  }
  return json({ error: "Не найдено" }, 404);
}

async function createAudit(request: Request, user: Account): Promise<Response> {
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
    });
  }
  await setReportDocument(sessionId, reportId);
  void enqueue(sessionId);
  return json(await readSession(sessionId), 201);
}

async function addDocuments(request: Request, sessionId: string): Promise<Response> {
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
    });
  }
  const job = enqueueRebuild(sessionId);
  await whenRebuildQueued(sessionId);
  void job;
  return json(await readSession(sessionId), 200);
}

async function review(request: Request, sessionId: string, checkId: string): Promise<Response> {
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

async function decision(request: Request, sessionId: string): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { decision?: Decision | null; comment?: string } | null;
  if (!body) return json({ error: "Некорректный запрос" }, 400);
  const value = body.decision ?? null;
  if (value && value !== "accept" && value !== "revise") return json({ error: "Неизвестное решение" }, 400);
  await saveDecision(sessionId, value, (body.comment ?? "").trim());
  return json(await readSession(sessionId), 200);
}

async function fileResponse(sessionId: string, documentId: string): Promise<Response> {
  if (!/^doc_[a-f0-9]+$/.test(documentId)) return json({ error: "Документ не найден" }, 404);
  const file = await readDocumentFile(sessionId, documentId);
  if (!file || !fs.existsSync(file.path)) return json({ error: "Документ не найден" }, 404);
  const data = fs.readFileSync(file.path);
  const headers = new Headers({
    "Content-Type": file.mimeType || "application/octet-stream",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  return new Response(new Uint8Array(data), { status: 200, headers });
}

async function canRead(id: string, user: Account): Promise<boolean> {
  const owner = await sessionOwner(id);
  return owner === user.id || user.role === "admin";
}

function authCookie(token: string, request: Request): string {
  const secure = request.headers.get("x-forwarded-proto") === "https" ? "; Secure" : "";
  return `sverko_auth=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`;
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

async function readJson<T>(request: Request): Promise<T | null> {
  return (await request.json().catch(() => null)) as T | null;
}

function json(payload: unknown, status: number, cookie?: string): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(payload), { status, headers });
}
