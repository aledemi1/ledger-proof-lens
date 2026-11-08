import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AuditDocument, AuditSession, CheckResult, Decision, DocumentType, EvidenceReference, ProcessingStage, RecheckSummary, ReviewerDecision, ReviewerStatus } from "@/types/audit";
import { withUrls, type PreviewDraft } from "./model";
import { dataDir } from "./paths";

let database: DatabaseSync | undefined;

export function db(): DatabaseSync {
  if (database) return database;
  const root = dataDir();
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, "sverko.sqlite");
  const next = new DatabaseSync(file);
  next.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      idempotency_key TEXT,
      title TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      report_document_id TEXT,
      stage TEXT,
      error TEXT,
      incomplete INTEGER NOT NULL DEFAULT 0,
      file_errors TEXT,
      notices TEXT,
      decision TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS sessions_owner_key ON sessions(owner, idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      read_error TEXT,
      preview_json TEXT
    );
    CREATE TABLE IF NOT EXISTS checks (
      id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    );
    CREATE TABLE IF NOT EXISTS reviews (
      session_id TEXT NOT NULL,
      check_id TEXT NOT NULL,
      reviewer_status TEXT NOT NULL,
      reviewer_comment TEXT NOT NULL,
      reviewed_at TEXT,
      PRIMARY KEY (session_id, check_id)
    );
  `);
  scopeCheckIdsToSession(next);
  ensureColumn(next, "sessions", "previous_id", "TEXT");
  ensureColumn(next, "sessions", "recheck", "TEXT");
  ensureColumn(next, "reviews", "source_json", "TEXT");
  database = next;
  return next;
}

function ensureColumn(connection: DatabaseSync, table: string, name: string, definition: string): void {
  const columns = connection.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((column) => column.name === name)) connection.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

function scopeCheckIdsToSession(connection: DatabaseSync): void {
  const columns = connection.prepare("PRAGMA table_info(checks)").all() as { name: string; pk: number }[];
  if (columns.filter((column) => column.pk > 0).length > 1) return;
  connection.exec(`
    BEGIN;
    ALTER TABLE checks RENAME TO checks_global_ids;
    CREATE TABLE checks (
      id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    );
    INSERT INTO checks (id, session_id, position, payload)
      SELECT id, session_id, position, payload FROM checks_global_ids;
    DROP TABLE checks_global_ids;
    COMMIT;
  `);
}

export function closeDb(): void {
  database?.close();
  database = undefined;
}

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
  incomplete: number;
  file_errors: string | null;
  notices: string | null;
  decision: string | null;
  previous_id: string | null;
  recheck: string | null;
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

export function findByIdempotency(owner: string, key: string): string | null {
  const row = db().prepare("SELECT id FROM sessions WHERE owner = ? AND idempotency_key = ?").get(owner, key) as { id: string } | undefined;
  return row?.id ?? null;
}

export function insertSession(input: {
  id: string;
  owner: string;
  idempotencyKey: string;
  title: string;
  description?: string;
  previousSessionId?: string;
}): void {
  db()
    .prepare(
      `INSERT INTO sessions (id, owner, idempotency_key, title, description, created_at, status, stage, previous_id)
       VALUES (?, ?, ?, ?, ?, ?, 'awaiting_processing', 'queued', ?)`,
    )
    .run(input.id, input.owner, input.idempotencyKey, input.title, input.description ?? null, new Date().toISOString(), input.previousSessionId ?? null);
}

export function insertDocument(input: {
  id: string;
  sessionId: string;
  role: "report" | "supporting";
  name: string;
  docType: DocumentType;
  mimeType: string;
  size: number;
  sha256: string;
  storagePath: string;
}): void {
  db()
    .prepare(
      `INSERT INTO documents (id, session_id, role, name, doc_type, mime_type, size, sha256, storage_path, page_count, preview_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .run(
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
    );
}

export function setReportDocument(sessionId: string, documentId: string): void {
  db().prepare("UPDATE sessions SET report_document_id = ? WHERE id = ?").run(documentId, sessionId);
}

export function listOwnedIds(owner: string): string[] {
  const rows = db().prepare("SELECT id FROM sessions WHERE owner = ? ORDER BY created_at DESC").all(owner) as { id: string }[];
  return rows.map((row) => row.id);
}

export function sessionOwner(id: string): string | null {
  const row = db().prepare("SELECT owner FROM sessions WHERE id = ?").get(id) as { owner: string } | undefined;
  return row?.owner ?? null;
}

export function readSession(id: string): AuditSession | null {
  const row = db().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
  if (!row) return null;
  const documents = documentRows(id);
  const checks = readChecks(id);
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
  if (row.incomplete) session.incomplete = true;
  if (row.file_errors) session.fileErrors = JSON.parse(row.file_errors) as { fileName: string; reason: string }[];
  if (row.notices) session.notices = JSON.parse(row.notices) as string[];
  if (row.recheck) {
    const summary = JSON.parse(row.recheck) as RecheckSummary;
    session.recheck = summary;
  }
  return session;
}

export function readDocuments(sessionId: string): AuditDocument[] {
  return documentRows(sessionId).map((row) => toDocument(sessionId, row));
}

export function readDocumentFile(sessionId: string, documentId: string): { path: string; mimeType: string; name: string } | null {
  const row = db().prepare("SELECT * FROM documents WHERE id = ? AND session_id = ?").get(documentId, sessionId) as DocumentRow | undefined;
  if (!row) return null;
  return { path: row.storage_path, mimeType: row.mime_type, name: row.name };
}

export function documentBuffers(sessionId: string): { row: DocumentRow; buffer: Buffer }[] {
  return documentRows(sessionId).map((row) => ({ row, buffer: fs.readFileSync(row.storage_path) }));
}

function documentRows(sessionId: string): DocumentRow[] {
  return db()
    .prepare("SELECT * FROM documents WHERE session_id = ? ORDER BY CASE role WHEN 'report' THEN 0 ELSE 1 END, name")
    .all(sessionId) as unknown as DocumentRow[];
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

function readChecks(sessionId: string): CheckResult[] {
  const rows = db().prepare("SELECT id, payload FROM checks WHERE session_id = ? ORDER BY position").all(sessionId) as { id: string; payload: string }[];
  const reviews = db().prepare("SELECT * FROM reviews WHERE session_id = ?").all(sessionId) as {
    check_id: string;
    reviewer_status: string;
    reviewer_comment: string;
    reviewed_at: string | null;
    source_json: string | null;
  }[];
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

export function checkCount(sessionId: string): number {
  const row = db().prepare("SELECT COUNT(*) AS n FROM checks WHERE session_id = ?").get(sessionId) as { n: number };
  return Number(row.n);
}

export function setStage(sessionId: string, stage: string, error?: string): void {
  db().prepare("UPDATE sessions SET stage = ?, error = ? WHERE id = ?").run(stage, error ?? null, sessionId);
}

export function markReprocessing(sessionId: string): void {
  db().prepare("UPDATE sessions SET status = 'awaiting_processing', stage = 'queued', error = NULL, decision = NULL WHERE id = ?").run(sessionId);
}

export function keepPreviousResult(sessionId: string, error: string): void {
  db().prepare("UPDATE sessions SET status = 'in_review', stage = 'done', error = ? WHERE id = ?").run(error, sessionId);
}

export function markFailed(sessionId: string, error: string, fileErrors: { fileName: string; reason: string }[]): void {
  db()
    .prepare("UPDATE sessions SET stage = 'failed', error = ?, file_errors = ?, status = 'awaiting_processing' WHERE id = ?")
    .run(error, JSON.stringify(fileErrors), sessionId);
}

export function saveDocumentRead(input: {
  id: string;
  pageCount: number;
  readError?: string;
  preview?: PreviewDraft;
}): void {
  db()
    .prepare("UPDATE documents SET page_count = ?, read_error = ?, preview_json = ? WHERE id = ?")
    .run(input.pageCount, input.readError ?? null, input.preview ? JSON.stringify(input.preview) : null, input.id);
}

export function saveOutcome(input: {
  sessionId: string;
  reportDocumentId: string;
  checks: CheckResult[];
  fileErrors: { fileName: string; reason: string }[];
  notices: string[];
  incomplete: boolean;
}): void {
  const connection = db();
  connection.exec("BEGIN");
  try {
    const keptReviews = connection
      .prepare(
        `SELECT c.payload, r.reviewer_status, r.reviewer_comment, r.reviewed_at, r.source_json
         FROM reviews r
         INNER JOIN checks c ON c.session_id = r.session_id AND c.id = r.check_id
         WHERE r.session_id = ?`,
      )
      .all(input.sessionId) as { payload: string; reviewer_status: string; reviewer_comment: string; reviewed_at: string | null; source_json: string | null }[];
    connection.prepare("DELETE FROM reviews WHERE session_id = ?").run(input.sessionId);
    connection.prepare("DELETE FROM checks WHERE session_id = ?").run(input.sessionId);
    const insert = connection.prepare("INSERT INTO checks (id, session_id, position, payload) VALUES (?, ?, ?, ?)");
    input.checks.forEach((check, index) => {
      const stored: CheckResult = { ...check, reviewerStatus: "pending", reviewerComment: "" };
      delete stored.reviewedAt;
      insert.run(check.id, input.sessionId, index, JSON.stringify(stored));
    });
    const restore = connection.prepare(
      `INSERT INTO reviews (session_id, check_id, reviewer_status, reviewer_comment, reviewed_at, source_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const row of keptReviews) {
      if (row.reviewer_status === "pending" && !row.reviewer_comment && !row.source_json) continue;
      const previous = JSON.parse(row.payload) as CheckResult;
      const sameName = input.checks.filter((check) => check.fieldName === previous.fieldName);
      const match = sameName.length === 1 ? sameName[0] : sameName.find((check) => check.reportValue === previous.reportValue);
      if (!match) continue;
      restore.run(input.sessionId, match.id, row.reviewer_status, row.reviewer_comment, row.reviewed_at, row.source_json);
    }
    connection
      .prepare(
        `UPDATE sessions
         SET status = 'in_review', stage = 'done', error = NULL, report_document_id = ?, incomplete = ?, file_errors = ?, notices = ?
         WHERE id = ?`,
      )
      .run(
        input.reportDocumentId,
        input.incomplete ? 1 : 0,
        JSON.stringify(input.fileErrors),
        JSON.stringify(input.notices),
        input.sessionId,
      );
    const previousId = (connection.prepare("SELECT previous_id FROM sessions WHERE id = ?").get(input.sessionId) as { previous_id: string | null } | undefined)?.previous_id;
    if (previousId && sessionOwner(previousId) === (connection.prepare("SELECT owner FROM sessions WHERE id = ?").get(input.sessionId) as { owner: string }).owner) {
      const previous = readChecks(previousId);
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
      const title = (connection.prepare("SELECT title FROM sessions WHERE id = ?").get(previousId) as { title: string }).title;
      const summary: RecheckSummary = { previousSessionId: previousId, previousTitle: title, closed, remaining, appeared };
      connection.prepare("UPDATE sessions SET recheck = ? WHERE id = ?").run(JSON.stringify(summary), input.sessionId);
    }
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

export function saveReview(sessionId: string, checkId: string, status: ReviewerStatus, comment: string, source?: EvidenceReference | null): void {
  const exists = db().prepare("SELECT id FROM checks WHERE id = ? AND session_id = ?").get(checkId, sessionId);
  if (!exists) throw new Error("Показатель не найден");
  const current = db().prepare("SELECT source_json FROM reviews WHERE session_id = ? AND check_id = ?").get(sessionId, checkId) as { source_json: string | null } | undefined;
  const sourceJson = source === undefined ? (current?.source_json ?? null) : source ? JSON.stringify(source) : null;
  db()
    .prepare(
      `INSERT INTO reviews (session_id, check_id, reviewer_status, reviewer_comment, reviewed_at, source_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, check_id) DO UPDATE SET
         reviewer_status = excluded.reviewer_status,
         reviewer_comment = excluded.reviewer_comment,
         reviewed_at = excluded.reviewed_at,
         source_json = excluded.source_json`,
    )
    .run(sessionId, checkId, status, comment, new Date().toISOString(), sourceJson);
}

export function clearReviews(sessionId: string): void {
  const connection = db();
  connection.prepare("DELETE FROM reviews WHERE session_id = ?").run(sessionId);
  connection.prepare("UPDATE sessions SET decision = NULL, status = 'in_review' WHERE id = ? AND status != 'awaiting_processing'").run(sessionId);
}

export function saveDecision(sessionId: string, decision: Decision | null, comment: string): void {
  if (!decision) {
    db().prepare("UPDATE sessions SET decision = NULL, status = 'in_review' WHERE id = ?").run(sessionId);
    return;
  }
  const payload: ReviewerDecision = { decision, comment, decidedAt: new Date().toISOString() };
  db().prepare("UPDATE sessions SET decision = ?, status = 'completed' WHERE id = ?").run(JSON.stringify(payload), sessionId);
}

export function deleteSession(sessionId: string): void {
  const rows = documentRows(sessionId);
  const connection = db();
  connection.exec("BEGIN");
  try {
    connection.prepare("DELETE FROM reviews WHERE session_id = ?").run(sessionId);
    connection.prepare("DELETE FROM checks WHERE session_id = ?").run(sessionId);
    connection.prepare("DELETE FROM documents WHERE session_id = ?").run(sessionId);
    connection.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
  for (const row of rows) {
    fs.rmSync(row.storage_path, { force: true });
  }
  fs.rmSync(path.dirname(rows[0]?.storage_path ?? path.join(dataDir(), "files", sessionId)), { recursive: true, force: true });
}

export function pendingSessionIds(): string[] {
  const rows = db()
    .prepare(
      `SELECT id FROM sessions
       WHERE status = 'awaiting_processing' AND stage IN ('queued', 'reading', 'extracting', 'matching') AND (error IS NULL OR error = '')`,
    )
    .all() as { id: string }[];
  return rows.map((row) => row.id);
}
