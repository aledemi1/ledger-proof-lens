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
export const TYPES = new Set(["unknown", "act", "invoice", "waybill", "contract", "payment", "other", "report"]);

export function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export function asType(value: string | undefined, filename: string): DocumentType {
  if (value && TYPES.has(value) && value !== "report") return value as DocumentType;
  const name = filename.toLowerCase();
  if (/наклад/.test(name)) return "waybill";
  if (/акт/.test(name)) return "act";
  if (/сч[её]т/.test(name)) return "invoice";
  if (/договор/.test(name)) return "contract";
  if (/плат/.test(name)) return "payment";
  return "unknown";
}

export function mimeOf(name: string): string {
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

export async function readJson<T>(request: Request): Promise<T | null> {
  return (await request.json().catch(() => null)) as T | null;
}

export function json(payload: unknown, status: number, cookie?: string): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(payload), { status, headers });
}

