import { buildConclusion } from "@/lib/conclusion";
import { DEMO_SESSION_ID, sampleDocuments, sampleSessions } from "@/mocks/demoAudit";
import { getDemoLocale } from "@/mocks/demoLocale";
import { loadDemoPack } from "@/mocks/localizedDemo";
import type { AuditDocument, AuditSession, EvidenceReference, ReviewerDecision, ReviewerStatus } from "@/types/audit";
import type { AuditService } from "./auditService";

/**
 * localStorage holds only reviewer verdicts, comments, decisions and draft metadata
 * (file names/sizes). File contents are never stored.
 */
const KEY = "sverko:v1";

interface StoredReview {
  reviewerStatus: ReviewerStatus;
  reviewerComment: string;
  reviewedAt?: string;
  reviewerSource?: EvidenceReference;
}
interface Store {
  reviews: Record<string, Record<string, StoredReview>>;
  decisions: Record<string, ReviewerDecision | null>;
  drafts: { session: AuditSession; documents: AuditDocument[] }[];
}

const empty = (): Store => ({ reviews: {}, decisions: {}, drafts: [] });

function read(): Store {
  if (typeof window === "undefined") return empty();
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    return empty();
  }
}

const listeners = new Set<() => void>();
function write(store: Store) {
  window.localStorage.setItem(KEY, JSON.stringify(store));
  listeners.forEach((l) => l());
}

function hydrate(session: AuditSession, store: Store): AuditSession {
  const reviews = store.reviews[session.id] ?? {};
  const checks = session.checks.map((c) => (reviews[c.id] ? { ...c, ...reviews[c.id] } : c));
  const decision = session.id in store.decisions ? (store.decisions[session.id] ?? null) : session.reviewerDecision;
  const status =
    session.status === "awaiting_processing" ? session.status : decision ? "completed" : "in_review";
  return { ...session, checks, reviewerDecision: decision, status };
}

async function demoPack() {
  return loadDemoPack(getDemoLocale());
}

function allSessions(store: Store, demo: { session: AuditSession; documents: AuditDocument[] }) {
  const sessions = [...store.drafts.map((d) => d.session), ...sampleSessions.map((session) => (session.id === DEMO_SESSION_ID ? demo.session : session))];
  return sessions.map((session) => hydrate(session, store));
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const mockAuditService: AuditService = {
  async listSessions() {
    const demo = await demoPack();
    return allSessions(read(), demo).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async getSession(id) {
    const demo = await demoPack();
    return allSessions(read(), demo).find((s) => s.id === id) ?? null;
  },
  async getDocuments(sessionId) {
    const store = read();
    const draft = store.drafts.find((d) => d.session.id === sessionId);
    if (draft) return draft.documents;
    if (sessionId === DEMO_SESSION_ID) return (await demoPack()).documents;
    const s = sampleSessions.find((x) => x.id === sessionId);
    if (!s) return [];
    const ids = [s.reportDocumentId, ...s.supportingDocumentIds];
    return ids.map((id) => sampleDocuments.find((d) => d.id === id)).filter(Boolean) as AuditDocument[];
  },
  async getChecks(sessionId) {
    return (await this.getSession(sessionId))?.checks ?? [];
  },
  async updateReportValue() {
    throw new Error("Демонстрационный отчёт не редактируется");
  },
  async updateReview(sessionId, checkId, update) {
    const store = read();
    const session = allSessions(store, await demoPack()).find((s) => s.id === sessionId);
    const check = session?.checks.find((c) => c.id === checkId);
    if (!check) throw new Error("Показатель не найден");
    const next: StoredReview = {
      reviewerStatus: update.reviewerStatus ?? check.reviewerStatus,
      reviewerComment: update.reviewerComment ?? check.reviewerComment,
      reviewedAt: new Date().toISOString(),
    };
    if (update.reviewerSource) next.reviewerSource = update.reviewerSource;
    else if (update.reviewerSource === undefined && check.reviewerSource) next.reviewerSource = check.reviewerSource;
    store.reviews[sessionId] = { ...(store.reviews[sessionId] ?? {}), [checkId]: next };
    write(store);
    return { ...check, ...next };
  },
  async resetReviews(sessionId) {
    const store = read();
    delete store.reviews[sessionId];
    delete store.decisions[sessionId];
    write(store);
  },
  async setReviewerDecision(sessionId, decision, comment = "") {
    const store = read();
    store.decisions[sessionId] = decision ? { decision, comment, decidedAt: new Date().toISOString() } : null;
    write(store);
    return (await this.getSession(sessionId))!;
  },
  async createDraft(input) {
    const store = read();
    const id = `draft-${uid()}`;
    const mk = (f: NewDraftInputFile, i: string): AuditDocument => ({
      id: `${id}-${i}`,
      name: f.name,
      type: f.type,
      mimeType: f.mimeType,
      size: f.size,
      pageCount: 0,
      preview: { kind: "none", reason: "Содержимое файла не сохраняется и не обрабатывается без подключённого сервера." },
    });
    const report = mk(input.report, "r");
    const supporting = input.supporting.map((f, i) => mk(f, String(i)));
    const session: AuditSession = {
      id,
      title: input.title,
      description: input.description,
      createdAt: new Date().toISOString(),
      status: "awaiting_processing",
      isDemo: false,
      reportDocumentId: report.id,
      supportingDocumentIds: supporting.map((d) => d.id),
      checks: [],
      recommendation: null,
      reviewerDecision: null,
    };
    store.drafts.unshift({ session, documents: [report, ...supporting] });
    write(store);
    return session;
  },
  async updateDetails() {
    return;
  },
  async suggestIndicators() {
    throw new Error("Демонстрационный комплект уже посчитан.");
  },
  async startSelection() {
    throw new Error("Демонстрационный комплект уже посчитан.");
  },
  async addDocuments(sessionId, files) {
    const store = read();
    const draft = store.drafts.find((item) => item.session.id === sessionId);
    if (!draft) throw new Error("Демонстрационный комплект не изменяется. Новые документы можно добавить в своей проверке.");
    const added = files.map((file, index) => ({
      id: `${sessionId}-add-${uid()}-${index}`,
      name: file.name,
      type: "unknown" as const,
      mimeType: file.type,
      size: file.size,
      pageCount: 0,
      preview: { kind: "none" as const, reason: "Файл принят, но локальный черновик не пересчитывает сверку." },
    }));
    draft.documents.push(...added);
    draft.session.supportingDocumentIds.push(...added.map((document) => document.id));
    draft.session.processingError = "Локальный черновик не пересчитывает сверку. Загрузите комплект через сервер.";
    write(store);
    return draft.session;
  },
  async findIndicator() {
    throw new Error("Демонстрационный комплект не изменяется. Пропущенный показатель можно добавить в своей проверке.");
  },
  async deleteDraft(sessionId) {
    const store = read();
    store.drafts = store.drafts.filter((d) => d.session.id !== sessionId);
    write(store);
  },
  async getConclusion(sessionId) {
    const s = await this.getSession(sessionId);
    if (!s || s.checks.length === 0) return null;
    return buildConclusion(s, await this.getDocuments(sessionId));
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

type NewDraftInputFile = Parameters<AuditService["createDraft"]>[0]["report"];
