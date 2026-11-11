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
import { authCookie, claimGuestAudits } from "./access";
import { cookieValue, json, readJson } from "./respond";

export async function authApi(request: Request, parts: string[]): Promise<Response> {
  if (parts[2] === "register" && request.method === "POST") return register(request);
  if (parts[2] === "verify-email" && request.method === "POST") return verifyEmail(request);
  if (parts[2] === "login" && request.method === "POST") return login(request);
  if (parts[2] === "logout" && request.method === "POST") return logout(request);
  if (parts[2] === "me" && request.method === "GET") {
    const user = await accountFromToken(cookieValue(request.headers.get("cookie"), "sverko_auth"));
    return user ? json(user, 200) : json({ error: "Войдите в аккаунт" }, 401);
  }
  if (parts[2] === "password" && request.method === "POST") return updatePassword(request);
  return json({ error: "Не найдено" }, 404);
}

export async function register(request: Request): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string }>(request);
  if (!body) return json({ error: "Некорректный запрос" }, 400);
  try {
    const email = normalizeEmail(String(body.email ?? ""));
    const account = await createAccount(email, String(body.password ?? ""), "user", !mailConfigured());
    if (mailConfigured()) {
      try {
        await sendRegistrationEmail(account.id, email, request);
      } catch {
        console.error("[auth] verification email failed");
        return json({ error: "Не удалось отправить письмо. Попробуйте ещё раз." }, 502);
      }
      return json({ pending: true, email }, 202);
    }
    const token = await openAuthSession(account.id);
    const response = json(account, 201, authCookie(token, request));
    const clearGuest = await claimGuestAudits(request, account.id);
    if (clearGuest) response.headers.append("Set-Cookie", clearGuest);
    return response;
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.code === "duplicate" ? 409 : 400);
    throw error;
  }
}

export async function verifyEmail(request: Request): Promise<Response> {
  const body = await readJson<{ token?: string }>(request);
  if (!body?.token) return json({ error: "Ссылка подтверждения недействительна" }, 400);
  try {
    const account = await confirmEmail(body.token);
    const token = await openAuthSession(account.id);
    const response = json(account, 200, authCookie(token, request));
    const clearGuest = await claimGuestAudits(request, account.id);
    if (clearGuest) response.headers.append("Set-Cookie", clearGuest);
    return response;
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, 400);
    throw error;
  }
}

export async function login(request: Request): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string }>(request);
  if (!body) return json({ error: "Некорректный запрос" }, 400);
  const account = await loginAccount(normalizeEmail(String(body.email ?? "")), String(body.password ?? ""));
  if (account === "unverified") return json({ error: "Сначала подтвердите почту по ссылке из письма" }, 403);
  if (!account) return json({ error: "Неверная почта или пароль" }, 401);
  const token = await openAuthSession(account.id);
  const response = json(account, 200, authCookie(token, request));
  const clearGuest = await claimGuestAudits(request, account.id);
  if (clearGuest) response.headers.append("Set-Cookie", clearGuest);
  return response;
}

export async function logout(request: Request): Promise<Response> {
  const token = cookieValue(request.headers.get("cookie"), "sverko_auth");
  await closeAuthSession(token);
  return json({ ok: true }, 200, "sverko_auth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

export async function updatePassword(request: Request): Promise<Response> {
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
