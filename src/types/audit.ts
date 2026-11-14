/** Core domain models for Sverko. Shared by the mock service and the future API client. */

export type CheckStatus = "match" | "mismatch" | "not_found" | "needs_review";

/** One sentence of a check explanation. Document names and amounts stay in the fields; the sentence is translated at display time. */
export type CheckNote =
  | { code: "legacy"; text: string }
  | { code: "order_closed" }
  | { code: "order_open" }
  | { code: "blank_signature"; label: string; report: string }
  | { code: "payment_purpose"; number: string; contract: string }
  | { code: "completion_letter"; label: string }
  | { code: "completion_missing"; label: string }
  | { code: "shipment_count"; count: number; names: string }
  | { code: "shipment_none" }
  | { code: "remainder"; value: string }
  | { code: "report_vs_doc"; report: string; document: string; source: string }
  | { code: "values_disagree"; label: string; parts: string; report: string }
  | { code: "quantity_collected"; net: boolean; parts: string; total: string }
  | { code: "money_disagree"; label: string; parts: string; report: string }
  | { code: "money_collected"; net: boolean; parts: string; total: string }
  | { code: "newer_document"; earlier: string }
  | { code: "formula_blank"; label: string }
  | { code: "exact_text" }
  | { code: "partial_read_value"; label: string; detail: string }
  | { code: "text_seen"; value: string; documents: string }
  | { code: "damaged_field"; document: string; label: string }
  | { code: "needs_model"; label: string }
  | { code: "not_found_role"; label: string; value: string; ask: "transport" | "money" | "quantity" | "date" | "other" }
  | { code: "item_listed"; value: string }
  | { code: "conflict"; label: string; parts: string; report: string }
  | { code: "source_confirms"; label: string }
  | { code: "not_found"; label: string }
  | { code: "within_tolerance"; label: string }
  | { code: "mismatch_detail"; report: string; document: string; source: string; label: string; delta?: string }
  | { code: "shipments_total"; parts: string; total: string; askMore: boolean }
  | { code: "model_labels"; labels: string }
  | { code: "model_unavailable" }
  | { code: "model_other"; document: string; quote: string }
  | { code: "model_not_operation"; document: string; quote: string }
  | { code: "model_compared"; document: string; report: string; quote: string; difference?: string }
  | { code: "model_unparsed"; document: string; quote: string }
  | { code: "model_match"; document: string }
  | { code: "model_sum_open"; count: number; listed: string }
  | { code: "model_sum_kept"; count: number; listed: string }
  | { code: "model_summed"; count: number; listed: string; report: string; difference?: string }
  | { code: "cited"; name: string; count: number }
  | { code: "cite_missing"; name: string }
  | { code: "model_omitted"; label: string }
  | { code: "calculated"; formula: string; total: string; report: string; difference?: string }
  | { code: "insufficient"; name: string }
  | { code: "selected_found"; text: string; count: number }
  | { code: "selected_missing"; text: string }
  | { code: "edited_unparsed"; value: string }
  | { code: "edited_match"; value: string }
  | { code: "edited_diff"; value: string; source: string; delta?: string }
  | { code: "fallback_mismatch"; report: string; source: string; delta?: string }
  | { code: "fallback_missing"; value: string }
  | { code: "fallback_review" }
  | { code: "fallback_match" };

export type CheckExplanation = CheckNote[] | string;
export type Severity = "high" | "medium" | "low";
/** Reviewer verdict — stored separately from the automatic CheckStatus. */
export type ReviewerStatus = "pending" | "confirmed" | "verified";
export type SessionStatus = "awaiting_processing" | "in_review" | "completed";
export type ProcessingStage = "queued" | "reading" | "extracting" | "matching" | "selecting" | "done" | "failed";
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
  /** Column widths in pixels, taken from the workbook when it stored them. */
  widths?: number[];
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
  /** Codes rendered in the interface language. A stored sentence stays as written. */
  explanation: CheckExplanation;
  evidenceReferences: EvidenceReference[];
  /** Where the value sits in the main report. */
  reportReference?: EvidenceReference;
  /** Set when a person replaced the value read from the report. */
  reportEdited?: boolean;
  reviewerStatus: ReviewerStatus;
  reviewerComment: string;
  reviewedAt?: string;
  /** A source the reviewer chose instead of the automatic one. Does not replace status. */
  reviewerSource?: EvidenceReference;
}

export interface ReviewerDecision {
  decision: Decision;
  comment: string;
  decidedAt: string;
}

export type AuditNotice =
  | { code: "duplicate_file"; name: string }
  | { code: "partial_read" }
  | { code: "model_two_stage" }
  | { code: "model_failed"; reason: string }
  | { code: "labels_failed"; reason: string }
  | { code: "context_truncated"; kept: number; limit: number }
  | { code: "legacy"; text: string };

export interface AuditSession {
  id: string;
  title: string;
  description?: string | undefined;
  createdAt: string;
  status: SessionStatus;
  isDemo: boolean;
  /** Set when the check belongs to a registered account. */
  ownerEmail?: string;
  reportDocumentId: string | null;
  supportingDocumentIds: string[];
  checks: CheckResult[];
  recommendation: Recommendation | null;
  reviewerDecision: ReviewerDecision | null;
  processingStage?: ProcessingStage;
  /** Rough seconds still expected for the current read or the upcoming reconciliation. */
  estimateSeconds?: number;
  /** Present while the person is choosing report values, and after they confirm them. */
  selection?: ReportSelection;
  processingError?: string;
  fileErrors?: { fileName: string; reason: string }[];
  incomplete?: boolean;
  /** How this run differs from an earlier check of the same subject. */
  recheck?: RecheckSummary;
  notices?: AuditNotice[];
}

export interface ChosenCell {
  anchor: string;
  name: string;
  value: string;
}

export interface ReportRegion {
  id: string;
  name: string;
  value: string;
  pageNumber: number;
  anchor: string;
  box?: EvidenceBox;
}

export interface ReportSelection {
  phase: "deferred" | "selecting" | "chosen";
  regions: ReportRegion[];
  chosen?: { anchor?: string; name: string; value: string }[];
  ocrPages: number;
  textChars: number;
}

export interface RecheckSummary {
  previousSessionId: string;
  previousTitle: string;
  closed: number;
  remaining: number;
  appeared: number;
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
  /** Earlier check this upload is meant to replace. */
  previousSessionId?: string;
  /** Read the report first and wait for the person to choose values. */
  deferSelection?: boolean;
  report: NewDraftFile;
  supporting: NewDraftFile[];
}

export interface ReviewUpdate {
  reviewerStatus?: ReviewerStatus | undefined;
  reviewerComment?: string | undefined;
  /** Pass null to clear a reviewer-chosen source. Omit to leave it unchanged. */
  reviewerSource?: EvidenceReference | null | undefined;
}
