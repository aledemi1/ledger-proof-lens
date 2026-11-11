import { randomBytes } from "node:crypto";
import { mailConfigured } from "../mail";
import fs from "node:fs";
import path from "node:path";
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
} from "../db";
import { loadEnv } from "../env";
import { InboxError, listInbox, readInbox } from "../inbox";
import { adminStats, get, run } from "../store";
import { fileExtension, validateFile } from "../extract/index";
import { dataDir } from "../paths";
import { formatSigned, parseMoney, parseQuantity } from "../values";
import * as XLSX from "xlsx";
import { enqueue, enqueueRebuild, findSelectedIndicator, sha256, whenRebuildQueued } from "../process";
import { cookieValue, json, readJson } from "./respond";

export async function adminApi(request: Request, parts: string[]): Promise<Response> {
  const user = await accountFromToken(cookieValue(request.headers.get("cookie"), "sverko_auth"));
  if (!user) return json({ error: "Войдите в аккаунт" }, 401);
  if (user.role !== "admin") return json({ error: "Недостаточно прав" }, 403);
  if (parts[2] === "users" && parts.length === 3 && request.method === "GET") return json(await listAccounts(), 200);
  if (parts[2] === "users" && parts.length === 3 && request.method === "POST") return createUser(request);
  if (parts[2] === "users" && parts[3] && parts.length === 4 && request.method === "PATCH") return updateUser(request, parts[3]);
  if (parts[2] === "inbox" && parts.length === 3 && request.method === "GET") return inboxList();
  if (parts[2] === "inbox" && parts[3] && parts.length === 4 && request.method === "GET") return inboxLetter(parts[3]);
  if (parts[2] === "stats" && parts.length === 3 && request.method === "GET") return json(await adminStats(), 200);
  return json({ error: "Не найдено" }, 404);
}

export async function inboxList(): Promise<Response> {
  try {
    return json(await listInbox(), 200);
  } catch (error) {
    if (error instanceof InboxError) return json({ error: error.message }, 502);
    throw error;
  }
}

export async function inboxLetter(rawUid: string): Promise<Response> {
  const uid = Number(rawUid);
  if (!Number.isInteger(uid) || uid < 1) return json({ error: "Некорректное письмо" }, 400);
  try {
    const letter = await readInbox(uid);
    if (!letter) return json({ error: "Письмо не найдено" }, 404);
    return json(letter, 200);
  } catch (error) {
    if (error instanceof InboxError) return json({ error: error.message }, error.code === "not_configured" ? 409 : 502);
    throw error;
  }
}

export async function createUser(request: Request): Promise<Response> {
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

export async function updateUser(request: Request, id: string): Promise<Response> {
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
