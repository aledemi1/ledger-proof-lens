import { AlertTriangle, CheckCircle2, CircleDashed, FlaskConical, HelpCircle, Clock, XCircle, Loader } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CheckStatus, Recommendation, ReviewerStatus, SessionStatus, Severity } from "@/types/audit";

const pill = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export const checkStatusMeta: Record<CheckStatus, { label: string; cls: string; dot: string; Icon: typeof CheckCircle2 }> = {
  match: { label: "Совпадает", cls: "bg-success-soft text-success", dot: "bg-success", Icon: CheckCircle2 },
  mismatch: { label: "Расхождение", cls: "bg-danger-soft text-danger", dot: "bg-danger", Icon: XCircle },
  not_found: { label: "Не найдено подтверждение", cls: "bg-orange-soft text-orange", dot: "bg-orange", Icon: HelpCircle },
  needs_review: { label: "Требует проверки", cls: "bg-warning-soft text-warning", dot: "bg-warning", Icon: AlertTriangle },
};

export function CheckStatusBadge({ status, className }: { status: CheckStatus; className?: string }) {
  const m = checkStatusMeta[status];
  return (
    <span className={cn(pill, m.cls, className)}>
      <m.Icon className="size-3.5" />
      {m.label}
    </span>
  );
}

export const reviewerMeta: Record<ReviewerStatus, { label: string; cls: string }> = {
  pending: { label: "Не рассмотрено", cls: "text-muted-foreground" },
  confirmed: { label: "Замечание подтверждено", cls: "text-danger" },
  verified: { label: "Проверено", cls: "text-success" },
};

export function ReviewerBadge({ status }: { status: ReviewerStatus }) {
  const m = reviewerMeta[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", m.cls)}>
      {status === "pending" ? <CircleDashed className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
      {m.label}
    </span>
  );
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const map: Record<SessionStatus, { label: string; cls: string; Icon: typeof Clock }> = {
    awaiting_processing: { label: "Ожидает обработки", cls: "bg-muted text-muted-foreground", Icon: Loader },
    in_review: { label: "На рассмотрении", cls: "bg-primary-soft text-primary", Icon: Clock },
    completed: { label: "Завершена", cls: "bg-secondary text-secondary-foreground", Icon: CheckCircle2 },
  };
  const m = map[status];
  return (
    <span className={cn(pill, m.cls)}>
      <m.Icon className="size-3.5" />
      {m.label}
    </span>
  );
}

export const recommendationMeta: Record<Recommendation, { label: string; short: string; cls: string; dot: string }> = {
  revise: { label: "Вернуть отчёт на доработку", short: "Требует доработки", cls: "bg-danger-soft text-danger", dot: "bg-danger" },
  manual_review: { label: "Завершить ручную проверку", short: "Нужна ручная проверка", cls: "bg-warning-soft text-warning", dot: "bg-warning" },
  accept: { label: "Принять отчёт", short: "Без замечаний", cls: "bg-success-soft text-success", dot: "bg-success" },
};

export function RecommendationBadge({ rec }: { rec: Recommendation }) {
  const m = recommendationMeta[rec];
  return (
    <span className={cn(pill, m.cls)}>
      <span className={cn("size-1.5 rounded-full", m.dot)} />
      {m.short}
    </span>
  );
}

export const severityMeta: Record<Severity, { label: string; cls: string }> = {
  high: { label: "Существенное", cls: "text-danger" },
  medium: { label: "Среднее", cls: "text-orange" },
  low: { label: "Низкое", cls: "text-muted-foreground" },
};

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning",
        className,
      )}
      title="Все данные синтетические и не относятся к реальным организациям"
    >
      <FlaskConical className="size-3" />
      Демонстрационные данные
    </span>
  );
}
