import { randomBytes } from "node:crypto";
import { mailConfigured } from "./mail";
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
import { InboxError, listInbox, readInbox } from "./inbox";
import { adminStats, get, run } from "./store";
import { fileExtension, validateFile } from "./extract/index";
import { dataDir } from "./paths";
import { formatSigned, parseMoney, parseQuantity } from "./values";
import * as XLSX from "xlsx";
import { enqueue, enqueueRebuild, findSelectedIndicator, sha256, whenRebuildQueued } from "./process";
import { actorOf } from "./http/access";
import { adminApi } from "./http/admin";
import { auditsApi } from "./http/audits";
import { authApi } from "./http/auth";
import { json } from "./http/respond";

export async function handleApi(request: Request): Promise<Response> {
  loadEnv();
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api") return json({ error: "Не найдено" }, 404);
  if (parts[1] === "auth") return authApi(request, parts);
  if (parts[1] === "admin") return adminApi(request, parts);
  if (parts[1] !== "audits") return json({ error: "Не найдено" }, 404);

  const { actor, setCookie } = await actorOf(request);
  const response = await auditsApi(request, parts, actor);
  if (setCookie) response.headers.append("Set-Cookie", setCookie);
  return response;
}
