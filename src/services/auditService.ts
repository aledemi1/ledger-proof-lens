import type {
  AuditConclusion,
  AuditDocument,
  AuditSession,
  CheckResult,
  Decision,
  NewDraftInput,
  ReviewUpdate,
} from "@/types/audit";

/**
 * Single data-access contract used by every page.
 * Swap `mockAuditService` for an HTTP implementation later without touching UI code.
 */
export interface AuditService {
  listSessions(): Promise<AuditSession[]>;
  getSession(id: string): Promise<AuditSession | null>;
  getDocuments(sessionId: string): Promise<AuditDocument[]>;
  getChecks(sessionId: string): Promise<CheckResult[]>;
  updateReview(sessionId: string, checkId: string, update: ReviewUpdate): Promise<CheckResult>;
  updateReportValue(sessionId: string, checkId: string, value: string): Promise<CheckResult>;
  resetReviews(sessionId: string): Promise<void>;
  setReviewerDecision(sessionId: string, decision: Decision | null, comment?: string): Promise<AuditSession>;
  createDraft(input: NewDraftInput): Promise<AuditSession>;
  addDocuments(sessionId: string, files: File[]): Promise<AuditSession>;
  findIndicator(sessionId: string, input: { text: string; anchor?: string | null }): Promise<CheckResult>;
  deleteDraft(sessionId: string): Promise<void>;
  getConclusion(sessionId: string): Promise<AuditConclusion | null>;
  /** Notifies subscribers after any mutation. Returns unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export { apiAuditService as auditService } from "./apiAuditService";
