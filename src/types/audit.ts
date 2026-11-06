/** Core domain models for Sverko. Shared by the mock service and the future API client. */

export type CheckStatus = "match" | "mismatch" | "not_found" | "needs_review";
export type Severity = "high" | "medium" | "low";
/** Reviewer verdict — stored separately from the automatic CheckStatus. */
export type ReviewerStatus = "pending" | "confirmed" | "verified";
export type SessionStatus = "awaiting_processing" | "in_review" | "completed";
export type ProcessingStage = "queued" | "reading" | "extracting" | "matching" | "done" | "failed";
export type Recommendation = "accept" | "revise" | "manual_review";
export type Decision = "accept" | "revise";

export type DocumentType =
  | "report"
  | "contract"
  | "act"
  | "waybill"
  | "invoice"
  | "payment"
  | "other"
  | "unknown";

/** A text fragment; an object fragment can be highlighted by its anchor. */
export type DocSegment = string | { text: string; anchor: string; variant?: "signature" };

export type DocBlock =
  | { kind: "title"; text: DocSegment[]; subtitle?: DocSegment[] }
  | { kind: "meta"; left: DocSegment[]; right: DocSegment[] }
  | { kind: "paragraph"; text: DocSegment[] }
  | { kind: "fields"; rows: { label: string; value: DocSegment[] }[] }
  | { kind: "table"; headers: string[]; rows: DocSegment[][]; align?: ("left" | "right" | "center")[] }
  | { kind: "signatures"; items: { role: string; name: string; sign: DocSegment[] }[] }
  | { kind: "sheet"; headers: string[]; rows: DocSegment[][] };

export interface DocPage {
  blocks: DocBlock[];
}

export interface GridCell {
  anchor: string;
  text: string;
  address: string;
}

export interface GridSheet {
  name: string;
  rows: { index: number; cells: GridCell[] }[];
}

export interface FlowBlock {
  kind: "paragraph" | "table";
  anchor?: string;
  text?: string;
  rows?: { cells: { anchor: string; text: string }[] }[];
}

export interface EvidenceBox {
  /** Normalized 0..1 against the rendered page or image. Present only when extraction measured it. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DocumentPreview =
  | { kind: "synthetic"; pages: DocPage[] }
  | { kind: "grid"; sheets: GridSheet[] }
  | { kind: "flow"; blocks: FlowBlock[] }
  | { kind: "pdf"; url: string; pageCount: number }
  | { kind: "image"; url: string; width: number; height: number }
  | { kind: "none"; reason: string };

export interface AuditDocument {
  id: string;
  name: string;
  type: DocumentType;
  mimeType: string;
  size: number;
  pageCount: number;
  preview: DocumentPreview;
}

export interface EvidenceReference {
  documentId: string;
  pageNumber: number;
  sourceText: string;
  /** Anchor inside the preview the user is looking at. Omitted when the spot cannot be marked. */
  locationInDocument?: string;
  /** Human place: sheet and cell, paragraph, or page. Preferred over a bare page number. */
  locationLabel?: string;
  /** Real box from extraction. Never invented from a quote alone. */
  box?: EvidenceBox;
  note?: string;
}

export interface CheckResult {
  id: string;
  fieldName: string;
  reportValue: string;
  sourceValue: string | null;
  unit?: string;
  /** Human-readable discrepancy, e.g. "+30 000 ₽". */
  discrepancy: string | null;
  status: CheckStatus;
  severity: Severity;
  explanation: string;
  evidenceReferences: EvidenceReference[];
  /** Where the value sits in the main report. */
  reportReference?: EvidenceReference;
  reviewerStatus: ReviewerStatus;
  reviewerComment: string;
  reviewedAt?: string;
}

export interface ReviewerDecision {
  decision: Decision;
  comment: string;
  decidedAt: string;
}

export interface AuditSession {
  id: string;
  title: string;
  description?: string | undefined;
  createdAt: string;
  status: SessionStatus;
  isDemo: boolean;
  reportDocumentId: string | null;
  supportingDocumentIds: string[];
  checks: CheckResult[];
  recommendation: Recommendation | null;
  reviewerDecision: ReviewerDecision | null;
  processingStage?: ProcessingStage;
  processingError?: string;
  fileErrors?: { fileName: string; reason: string }[];
  notices?: string[];
  incomplete?: boolean;
}

export interface Finding {
  checkId: string;
  fieldName: string;
  reportValue: string;
  sourceValue: string | null;
  status: CheckStatus;
  severity: Severity;
  summary: string;
  evidence: { documentId: string; documentName: string; pageNumber: number; locationLabel?: string }[];
  reviewerStatus: ReviewerStatus;
  reviewerComment: string;
}

export interface ConclusionStats {
  total: number;
  matched: number;
  mismatches: number;
  notFound: number;
  needsReview: number;
  unreviewed: number;
}

export interface AuditConclusion {
  sessionId: string;
  recommendation: Recommendation;
  findings: Finding[];
  stats: ConclusionStats;
  text: string;
  reviewerDecision: ReviewerDecision | null;
  reviewerComment: string;
}

export interface NewDraftFile {
  name: string;
  size: number;
  mimeType: string;
  type: DocumentType;
  /** Original selected in the browser. The mock ignores it; the API upload requires it. */
  file?: File;
}

export interface NewDraftInput {
  title: string;
  description?: string | undefined;
  /** Stable across a double click so the server returns the same audit. */
  idempotencyKey?: string;
  report: NewDraftFile;
  supporting: NewDraftFile[];
}

export interface ReviewUpdate {
  reviewerStatus?: ReviewerStatus | undefined;
  reviewerComment?: string | undefined;
}
