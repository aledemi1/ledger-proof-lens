import { buildConclusion } from "@/lib/conclusion";
import { mockAuditService } from "@/services/mockAuditService";
import type { AuditDocument, AuditSession, CheckResult, NewDraftInput } from "@/types/audit";
import type { AuditService } from "./auditService";

export class AuditApiError extends Error {
  status: number;
  files: { fileName: string; reason: string }[];
  demos: AuditSession[];
  constructor(message: string, status: number, files: { fileName: string; reason: string }[] = [], demos: AuditSession[] = []) {
    super(message);
    this.status = status;
    this.files = files;
    this.demos = demos;
  }
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((listener) => listener());
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, credentials: "same-origin" });
  } catch {
    throw new AuditApiError("Сервер проверки недоступен. Запустите приложение командой bun run dev.", 0);
  }
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as { error?: string; files?: { fileName: string; reason: string }[] }) : {};
  if (!response.ok) {
    throw new AuditApiError(payload.error || "Сервер вернул ошибку", response.status, payload.files ?? []);
  }
  return payload as T;
}

async function isDemo(id: string): Promise<boolean> {
  const session = await mockAuditService.getSession(id);
  return Boolean(session?.isDemo);
}

export const apiAuditService: AuditService = {
  async listSessions() {
    const demos = (await mockAuditService.listSessions()).filter((session) => session.isDemo);
    try {
      const remote = await request<AuditSession[]>("/api/audits");
      return [...remote, ...demos].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (error) {
      if (error instanceof AuditApiError) error.demos = demos;
      throw error;
    }
  },
  async getSession(id) {
    if (await isDemo(id)) return mockAuditService.getSession(id);
    try {
      return await request<AuditSession>(`/api/audits/${id}`);
    } catch (error) {
      if (error instanceof AuditApiError && error.status === 404) return null;
      throw error;
    }
  },
  async getDocuments(sessionId) {
    if (await isDemo(sessionId)) return mockAuditService.getDocuments(sessionId);
    try {
      return await request<AuditDocument[]>(`/api/audits/${sessionId}/documents`);
    } catch (error) {
      if (error instanceof AuditApiError && error.status === 404) return [];
      throw error;
    }
  },
  async getChecks(sessionId) {
    return (await this.getSession(sessionId))?.checks ?? [];
  },
  async updateReview(sessionId, checkId, update) {
    if (await isDemo(sessionId)) {
      const updated = await mockAuditService.updateReview(sessionId, checkId, update);
      emit();
      return updated;
    }
    const updated = await request<CheckResult>(`/api/audits/${sessionId}/checks/${checkId}/review`, {
      method: "POST",
      body: JSON.stringify(update),
    });
    emit();
    return updated;
  },
  async updateReportValue(sessionId, checkId, value) {
    if (await isDemo(sessionId)) throw new AuditApiError("Демонстрационный отчёт не редактируется", 400);
    const updated = await request<CheckResult>(`/api/audits/${sessionId}/checks/${checkId}/report-value`, {
      method: "POST",
      body: JSON.stringify({ value }),
    });
    emit();
    return updated;
  },
  async resetReviews(sessionId) {
    if (await isDemo(sessionId)) {
      await mockAuditService.resetReviews(sessionId);
      emit();
      return;
    }
    await request(`/api/audits/${sessionId}/reviews/reset`, { method: "POST", body: "{}" });
    emit();
  },
  async setReviewerDecision(sessionId, decision, comment = "") {
    if (await isDemo(sessionId)) {
      const session = await mockAuditService.setReviewerDecision(sessionId, decision, comment);
      emit();
      return session;
    }
    const session = await request<AuditSession>(`/api/audits/${sessionId}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, comment }),
    });
    emit();
    return session;
  },
  async createDraft(input: NewDraftInput) {
    if (!input.report.file) throw new AuditApiError("Файл отчёта не приложен", 400);
    const form = new FormData();
    form.set("title", input.title);
    if (input.description) form.set("description", input.description);
    form.set("idempotencyKey", input.idempotencyKey || crypto.randomUUID());
    if (input.previousSessionId) form.set("previousSessionId", input.previousSessionId);
    form.set("report", input.report.file, input.report.name);
    for (const file of input.supporting) {
      if (!file.file) throw new AuditApiError(`Файл «${file.name}» не приложен`, 400);
      form.append("supporting", file.file, file.name);
    }
    form.set("supportingTypes", JSON.stringify(input.supporting.map((file) => file.type)));
    const session = await request<AuditSession>("/api/audits", { method: "POST", body: form });
    emit();
    return session;
  },
  async addDocuments(sessionId, files) {
    if (await isDemo(sessionId)) throw new AuditApiError("Демонстрационный комплект не изменяется. Новые документы можно добавить в своей проверке.", 400);
    if (!files.length) throw new AuditApiError("Приложите хотя бы один подтверждающий документ", 400);
    const form = new FormData();
    for (const file of files) form.append("supporting", file, file.name);
    const session = await request<AuditSession>(`/api/audits/${sessionId}/documents`, { method: "POST", body: form });
    emit();
    return session;
  },
  async findIndicator(sessionId, input) {
    if (await isDemo(sessionId)) throw new AuditApiError("Демонстрационный комплект не изменяется. Пропущенный показатель можно добавить в своей проверке.", 400);
    const check = await request<CheckResult>(`/api/audits/${sessionId}/indicators`, { method: "POST", body: JSON.stringify(input) });
    emit();
    return check;
  },
  async deleteDraft(sessionId) {
    if (await isDemo(sessionId)) return;
    await request(`/api/audits/${sessionId}`, { method: "DELETE" });
    emit();
  },
  async getConclusion(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session || session.checks.length === 0) return null;
    const documents = await this.getDocuments(sessionId);
    return buildConclusion(session, documents);
  },
  subscribe(listener) {
    listeners.add(listener);
    const detach = mockAuditService.subscribe(listener);
    return () => {
      listeners.delete(listener);
      detach();
    };
  },
};
