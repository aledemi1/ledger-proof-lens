import fs from "node:fs";
import path from "node:path";
import { parseNotices } from "../lib/notice-codes";
import type { AuditDocument, AuditNotice, AuditSession, CheckResult, Decision, DocumentType, EvidenceReference, ProcessingStage, RecheckSummary, ReportSelection, ReviewerDecision, ReviewerStatus } from "@/types/audit";
import { withUrls, type PreviewDraft } from "./model";
import { dataDir } from "./paths";
import { all, get, run, transaction, type Query, closeDb } from "./store";

export { closeDb };

interface SessionRow {
  id: string;
  owner: string;
  idempotency_key: string | null;
  title: string;
  description: string | null;
  created_at: string;
  status: string;
  report_document_id: string | null;
  stage: string | null;
  error: string | null;
  incomplete: number | string;
  file_errors: string | null;
  notices: string | null;
  decision: string | null;
  previous_id: string | null;
  recheck: string | null;
  selection: string | null;
  estimate_seconds: number | string | null;
}

interface DocumentRow {
  id: string;
  session_id: string;
  role: string;
  name: string;
  doc_type: string;
  mime_type: string;
  size: number;
  sha256: string;
  storage_path: string;
  page_count: number;
  read_error: string | null;
  preview_json: string | null;
}

interface ReviewRow {
  check_id: string;
  reviewer_status: string;
  reviewer_comment: string;
  reviewed_at: string | null;
  source_json: string | null;
}

export async function findByIdempotency(owner: string, key: string): Promise<string | null> {
  const row = await get<{ id: string }>("SELECT id FROM sessions WHERE owner = ? AND idempotency_key = ?", [owner, key]);
  return row?.id ?? null;
}

export async function insertSession(input: {
  id: string;
  owner: string;
  idempotencyKey: string;
  title: string;
  description?: string;
  previousSessionId?: string;
}): Promise<void> {
  await run(
    `INSERT INTO sessions (id, owner, idempotency_key, title, description, created_at, status, stage, previous_id)
     VALUES (?, ?, ?, ?, ?, ?, 'awaiting_processing', 'queued', ?)`,
    [input.id, input.owner, input.idempotencyKey, input.title, input.description ?? null, new Date().toISOString(), input.previousSessionId ?? null],
  );
}

export async function insertDocument(input: {
  id: string;
  sessionId: string;
  role: "report" | "supporting";
  name: string;
  docType: DocumentType;
  mimeType: string;
  size: number;
  sha256: string;
  storagePath: string;
  body: Buffer;
}): Promise<void> {
  await run(
    `INSERT INTO documents (id, session_id, role, name, doc_type, mime_type, size, sha256, storage_path, page_count, preview_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      input.id,
      input.sessionId,
      input.role,
      input.name,
      input.docType,
      input.mimeType,
      input.size,
      input.sha256,
      input.storagePath,
      JSON.stringify({ kind: "none", reason: "Документ в очереди на чтение." }),
    ],
  );
  await run("INSERT INTO document_bodies (id, body) VALUES (?, ?)", [input.id, input.body]);
}

export async function setReportDocument(sessionId: string, documentId: string): Promise<void> {
  await run("UPDATE sessions SET report_document_id = ? WHERE id = ?", [documentId, sessionId]);
}

export async function listOwnedIds(owner: string): Promise<string[]> {
  const rows = await all<{ id: string }>("SELECT id FROM sessions WHERE owner = ? ORDER BY created_at DESC", [owner]);
  return rows.map((row) => row.id);
}

export async function listAllIds(): Promise<string[]> {
  const rows = await all<{ id: string }>("SELECT id FROM sessions ORDER BY created_at DESC");
  return rows.map((row) => row.id);
}

export async function sessionOwner(id: string): Promise<string | null> {
  const row = await get<{ owner: string }>("SELECT owner FROM sessions WHERE id = ?", [id]);
  return row?.owner ?? null;
}

export async function readSession(id: string): Promise<AuditSession | null> {
  const row = await get<SessionRow>("SELECT * FROM sessions WHERE id = ?", [id]);
  if (!row) return null;
  const documents = await documentRows(id);
  const checks = await readChecks(id);
  const decision = row.decision ? (JSON.parse(row.decision) as ReviewerDecision) : null;
  const session: AuditSession = {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    status: row.status as AuditSession["status"],
    isDemo: false,
    reportDocumentId: row.report_document_id,
    supportingDocumentIds: documents.filter((doc) => doc.role === "supporting").map((doc) => doc.id),
    checks,
    recommendation: null,
    reviewerDecision: decision,
  };
  if (row.description) session.description = row.description;
  if (row.stage) session.processingStage = row.stage as ProcessingStage;
  if (row.error) session.processingError = row.error;
  if (Number(row.incomplete)) session.incomplete = true;
  if (row.file_errors) session.fileErrors = JSON.parse(row.file_errors) as { fileName: string; reason: string }[];
  if (row.notices) session.notices = parseNotices(JSON.parse(row.notices));
  if (row.recheck) session.recheck = JSON.parse(row.recheck) as RecheckSummary;
  if (row.selection) session.selection = JSON.parse(row.selection) as ReportSelection;
  if (row.estimate_seconds != null && row.estimate_seconds !== "") session.estimateSeconds = Number(row.estimate_seconds);
  const owner = await get<{ email: string }>("SELECT email FROM users WHERE id = ?", [row.owner]);
  if (owner?.email) session.ownerEmail = owner.email;
  return session;
}

export async function readDocuments(sessionId: string): Promise<AuditDocument[]> {
  const rows = await documentRows(sessionId);
  return rows.map((row) => toDocument(sessionId, row));
}

function asBuffer(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") {
    const hex = value.startsWith("\\x") ? value.slice(2) : value;
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) return Buffer.from(hex, "hex");
  }
  return null;
}

async function bytesOf(row: DocumentRow): Promise<Buffer | null> {
  if (row.storage_path && fs.existsSync(row.storage_path)) return fs.readFileSync(row.storage_path);
  const stored = await get<{ body: unknown }>("SELECT body FROM document_bodies WHERE id = ?", [row.id]);
  const bytes = asBuffer(stored?.body);
  if (!bytes) return null;
  try {
    fs.mkdirSync(path.dirname(row.storage_path), { recursive: true });
    fs.writeFileSync(row.storage_path, bytes);
  } catch {
    // The container disk may be new. The bytes are still served from the database.
  }
  return bytes;
}

export async function readDocumentFile(sessionId: string, documentId: string): Promise<{ path: string; mimeType: string; name: string } | null> {
  const row = await get<DocumentRow>("SELECT * FROM documents WHERE id = ? AND session_id = ?", [documentId, sessionId]);
  if (!row) return null;
  return { path: row.storage_path, mimeType: row.mime_type, name: row.name };
}

export async function readDocumentBytes(sessionId: string, documentId: string): Promise<{ bytes: Buffer; mimeType: string; name: string } | null> {
  const row = await get<DocumentRow>("SELECT * FROM documents WHERE id = ? AND session_id = ?", [documentId, sessionId]);
  if (!row) return null;
  const bytes = await bytesOf(row);
  if (!bytes) return null;
  return { bytes, mimeType: row.mime_type, name: row.name };
}

export async function documentBuffers(sessionId: string): Promise<{ row: DocumentRow; buffer: Buffer }[]> {
  const rows = await documentRows(sessionId);
  const loaded: { row: DocumentRow; buffer: Buffer }[] = [];
  for (const row of rows) {
    const buffer = await bytesOf(row);
    if (!buffer) throw new Error(`файл «${row.name}» не найден на диске`);
    loaded.push({ row, buffer });
  }
  return loaded;
}

async function documentRows(sessionId: string, query?: Query): Promise<DocumentRow[]> {
  const read = query?.all<DocumentRow> ?? ((sql: string, params?: unknown[]) => all<DocumentRow>(sql, params));
  return read("SELECT * FROM documents WHERE session_id = ? ORDER BY CASE role WHEN 'report' THEN 0 ELSE 1 END, name", [sessionId]);
}

function toDocument(sessionId: string, row: DocumentRow): AuditDocument {
  const draft = row.preview_json ? (JSON.parse(row.preview_json) as PreviewDraft) : { kind: "none" as const, reason: row.read_error ?? "Нет предпросмотра" };
  const preview = row.read_error && draft.kind === "none" ? draft : withUrls(draft, `/api/audits/${sessionId}/files/${row.id}`);
  return {
    id: row.id,
    name: row.name,
    type: row.doc_type as DocumentType,
    mimeType: row.mime_type,
    size: row.size,
    pageCount: row.page_count,
    preview: row.read_error ? { kind: "none", reason: row.read_error } : preview,
  };
}

async function readChecks(sessionId: string, query?: Query): Promise<CheckResult[]> {
  const rows = await (query?.all<{ id: string; payload: string }> ?? all<{ id: string; payload: string }>)(
    "SELECT id, payload FROM checks WHERE session_id = ? ORDER BY position",
    [sessionId],
  );
  const reviews = await (query?.all<ReviewRow> ?? all<ReviewRow>)("SELECT * FROM reviews WHERE session_id = ?", [sessionId]);
  const byId = new Map(reviews.map((review) => [review.check_id, review]));
  return rows.map((row) => {
    const check = JSON.parse(row.payload) as CheckResult;
    const review = byId.get(row.id);
    if (!review) return check;
    const next: CheckResult = {
      ...check,
      reviewerStatus: review.reviewer_status as ReviewerStatus,
      reviewerComment: review.reviewer_comment,
    };
    if (review.reviewed_at) next.reviewedAt = review.reviewed_at;
    if (review.source_json) next.reviewerSource = JSON.parse(review.source_json) as EvidenceReference;
    return next;
  });
}

export async function checkCount(sessionId: string): Promise<number> {
  const row = await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM checks WHERE session_id = ?", [sessionId]);
  return Number(row?.n ?? 0);
}

export async function saveSelection(sessionId: string, selection: ReportSelection): Promise<void> {
  await run("UPDATE sessions SET selection = ? WHERE id = ?", [JSON.stringify(selection), sessionId]);
}

export async function setEstimate(sessionId: string, seconds: number): Promise<void> {
  await run("UPDATE sessions SET estimate_seconds = ? WHERE id = ?", [Math.round(seconds), sessionId]);
}

export async function setStage(sessionId: string, stage: string, error?: string): Promise<void> {
  await run("UPDATE sessions SET stage = ?, error = ? WHERE id = ?", [stage, error ?? null, sessionId]);
}

export async function markReprocessing(sessionId: string): Promise<void> {
  await run("UPDATE sessions SET status = 'awaiting_processing', stage = 'queued', error = NULL, decision = NULL WHERE id = ?", [sessionId]);
}

export async function keepPreviousResult(sessionId: string, error: string): Promise<void> {
  await run("UPDATE sessions SET status = 'in_review', stage = 'done', error = ? WHERE id = ?", [error, sessionId]);
}

export async function markFailed(sessionId: string, error: string, fileErrors: { fileName: string; reason: string }[]): Promise<void> {
  await run("UPDATE sessions SET stage = 'failed', error = ?, file_errors = ?, status = 'awaiting_processing' WHERE id = ?", [
    error,
    JSON.stringify(fileErrors),
    sessionId,
  ]);
}

export async function saveDocumentRead(input: { id: string; pageCount: number; readError?: string; preview?: PreviewDraft }): Promise<void> {
  await run("UPDATE documents SET page_count = ?, read_error = ?, preview_json = ? WHERE id = ?", [
    input.pageCount,
    input.readError ?? null,
    input.preview ? JSON.stringify(input.preview) : null,
    input.id,
  ]);
}

export async function saveOutcome(input: {
  sessionId: string;
  reportDocumentId: string;
  checks: CheckResult[];
  fileErrors: { fileName: string; reason: string }[];
  notices: AuditNotice[];
  incomplete: boolean;
}): Promise<void> {
  await transaction(async (query) => {
    const keptReviews = await query.all<{
      payload: string;
      reviewer_status: string;
      reviewer_comment: string;
      reviewed_at: string | null;
      source_json: string | null;
    }>(
      `SELECT c.payload, r.reviewer_status, r.reviewer_comment, r.reviewed_at, r.source_json
       FROM reviews r
       INNER JOIN checks c ON c.session_id = r.session_id AND c.id = r.check_id
       WHERE r.session_id = ?`,
      [input.sessionId],
    );
    await query.run("DELETE FROM reviews WHERE session_id = ?", [input.sessionId]);
    await query.run("DELETE FROM checks WHERE session_id = ?", [input.sessionId]);
    for (const [index, check] of input.checks.entries()) {
      const stored: CheckResult = { ...check, reviewerStatus: "pending", reviewerComment: "" };
      delete stored.reviewedAt;
      await query.run("INSERT INTO checks (id, session_id, position, payload) VALUES (?, ?, ?, ?)", [
        check.id,
        input.sessionId,
        index,
        JSON.stringify(stored),
      ]);
    }
    for (const row of keptReviews) {
      if (row.reviewer_status === "pending" && !row.reviewer_comment && !row.source_json) continue;
      const previous = JSON.parse(row.payload) as CheckResult;
      const sameName = input.checks.filter((check) => check.fieldName === previous.fieldName);
      const match = sameName.length === 1 ? sameName[0] : sameName.find((check) => check.reportValue === previous.reportValue);
      if (!match) continue;
      await query.run(
        `INSERT INTO reviews (session_id, check_id, reviewer_status, reviewer_comment, reviewed_at, source_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [input.sessionId, match.id, row.reviewer_status, row.reviewer_comment, row.reviewed_at, row.source_json],
      );
    }
    await query.run(
      `UPDATE sessions
       SET status = 'in_review', stage = 'done', error = NULL, report_document_id = ?, incomplete = ?, file_errors = ?, notices = ?
       WHERE id = ?`,
      [input.reportDocumentId, input.incomplete ? 1 : 0, JSON.stringify(input.fileErrors), JSON.stringify(input.notices), input.sessionId],
    );
    const current = await query.get<{ previous_id: string | null; owner: string }>("SELECT previous_id, owner FROM sessions WHERE id = ?", [input.sessionId]);
    if (!current?.previous_id) return;
    const previousOwner = await query.get<{ owner: string }>("SELECT owner FROM sessions WHERE id = ?", [current.previous_id]);
    if (previousOwner?.owner !== current.owner) return;
    const previous = await readChecks(current.previous_id, query);
    const before = new Set(previous.filter((check) => check.status !== "match").map((check) => check.fieldName));
    const after = new Set(input.checks.filter((check) => check.status !== "match").map((check) => check.fieldName));
    let closed = 0;
    let remaining = 0;
    let appeared = 0;
    for (const name of before) {
      if (after.has(name)) remaining += 1;
      else closed += 1;
    }
    for (const name of after) if (!before.has(name)) appeared += 1;
    const title = await query.get<{ title: string }>("SELECT title FROM sessions WHERE id = ?", [current.previous_id]);
    const summary: RecheckSummary = {
      previousSessionId: current.previous_id,
      previousTitle: title?.title ?? current.previous_id,
      closed,
      remaining,
      appeared,
    };
    await query.run("UPDATE sessions SET recheck = ? WHERE id = ?", [JSON.stringify(summary), input.sessionId]);
  });
}

export async function appendCheck(sessionId: string, check: CheckResult): Promise<void> {
  const row = await get<{ n: number | string | null }>("SELECT COALESCE(MAX(position), -1) AS n FROM checks WHERE session_id = ?", [sessionId]);
  const position = Number(row?.n ?? -1) + 1;
  const stored: CheckResult = { ...check, reviewerStatus: "pending", reviewerComment: "" };
  delete stored.reviewedAt;
  await run("INSERT INTO checks (id, session_id, position, payload) VALUES (?, ?, ?, ?)", [check.id, sessionId, position, JSON.stringify(stored)]);
}

export async function saveReview(sessionId: string, checkId: string, status: ReviewerStatus, comment: string, source?: EvidenceReference | null): Promise<void> {
  const exists = await get<{ id: string }>("SELECT id FROM checks WHERE id = ? AND session_id = ?", [checkId, sessionId]);
  if (!exists) throw new Error("Показатель не найден");
  const current = await get<{ source_json: string | null }>("SELECT source_json FROM reviews WHERE session_id = ? AND check_id = ?", [sessionId, checkId]);
  const sourceJson = source === undefined ? (current?.source_json ?? null) : source ? JSON.stringify(source) : null;
  await run(
    `INSERT INTO reviews (session_id, check_id, reviewer_status, reviewer_comment, reviewed_at, source_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, check_id) DO UPDATE SET
       reviewer_status = excluded.reviewer_status,
       reviewer_comment = excluded.reviewer_comment,
       reviewed_at = excluded.reviewed_at,
       source_json = excluded.source_json`,
    [sessionId, checkId, status, comment, new Date().toISOString(), sourceJson],
  );
}

export async function clearReviews(sessionId: string): Promise<void> {
  await transaction(async (query) => {
    await query.run("DELETE FROM reviews WHERE session_id = ?", [sessionId]);
    await query.run("UPDATE sessions SET decision = NULL, status = 'in_review' WHERE id = ? AND status != 'awaiting_processing'", [sessionId]);
  });
}

export async function saveDecision(sessionId: string, decision: Decision | null, comment: string): Promise<void> {
  if (!decision) {
    await run("UPDATE sessions SET decision = NULL, status = 'in_review' WHERE id = ?", [sessionId]);
    return;
  }
  const payload: ReviewerDecision = { decision, comment, decidedAt: new Date().toISOString() };
  await run("UPDATE sessions SET decision = ?, status = 'completed' WHERE id = ?", [JSON.stringify(payload), sessionId]);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const rows = await documentRows(sessionId);
  await transaction(async (query) => {
    await query.run("DELETE FROM reviews WHERE session_id = ?", [sessionId]);
    await query.run("DELETE FROM checks WHERE session_id = ?", [sessionId]);
    await query.run("DELETE FROM document_bodies WHERE id IN (SELECT id FROM documents WHERE session_id = ?)", [sessionId]);
    await query.run("DELETE FROM documents WHERE session_id = ?", [sessionId]);
    await query.run("DELETE FROM sessions WHERE id = ?", [sessionId]);
  });
  for (const row of rows) fs.rmSync(row.storage_path, { force: true });
  fs.rmSync(path.dirname(rows[0]?.storage_path ?? path.join(dataDir(), "files", sessionId)), { recursive: true, force: true });
}

export async function pendingSessionIds(): Promise<string[]> {
  const rows = await all<{ id: string }>(
    `SELECT id FROM sessions
     WHERE status = 'awaiting_processing' AND stage IN ('queued', 'reading', 'extracting', 'matching') AND (error IS NULL OR error = '')`,
  );
  return rows.map((row) => row.id);
}
