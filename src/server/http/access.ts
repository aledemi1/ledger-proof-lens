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
import { cookieValue } from "./respond";

export async function canRead(id: string, user: Account): Promise<boolean> {
  const owner = await sessionOwner(id);
  return owner === user.id || user.role === "admin";
}

export const GUEST_ID = /^gst_[a-f0-9]{32}$/;

export async function actorOf(request: Request): Promise<{ actor: Account; setCookie?: string }> {
  const user = await accountFromToken(cookieValue(request.headers.get("cookie"), "sverko_auth"));
  if (user) return { actor: user };
  const existing = cookieValue(request.headers.get("cookie"), "sverko_guest");
  if (existing && GUEST_ID.test(existing)) return { actor: { id: existing, email: "", role: "user" } };
  const id = `gst_${randomBytes(16).toString("hex")}`;
  return { actor: { id, email: "", role: "user" }, setCookie: guestCookie(id, request) };
}

export function guestCookie(id: string, request: Request): string {
  const secure = request.headers.get("x-forwarded-proto") === "https" ? "; Secure" : "";
  return `sverko_guest=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}`;
}

export async function claimGuestAudits(request: Request, userId: string): Promise<string | undefined> {
  const guest = cookieValue(request.headers.get("cookie"), "sverko_guest");
  if (!guest || !GUEST_ID.test(guest)) return undefined;
  await run("UPDATE sessions SET owner = ? WHERE owner = ?", [userId, guest]);
  const secure = request.headers.get("x-forwarded-proto") === "https" ? "; Secure" : "";
  return `sverko_guest=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

export function authCookie(token: string, request: Request): string {
  const secure = request.headers.get("x-forwarded-proto") === "https" ? "; Secure" : "";
  return `sverko_auth=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`;
}
