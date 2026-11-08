import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileSpreadsheet, Files, Folder, FolderOpen, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkStatusMeta, DemoBadge, RecommendationBadge, SessionStatusBadge } from "@/components/audit/badges";
import { useSessions } from "@/hooks/useAudit";
import { computeRecommendation } from "@/lib/conclusion";
import { formatDate, plural } from "@/lib/format";
import { countByStatus, statusOrder } from "@/lib/marks";
import { cn } from "@/lib/utils";
import type { AuditSession, SessionStatus } from "@/types/audit";

type Filter = "all" | SessionStatus;
const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "in_review", label: "На рассмотрении" },
  { id: "awaiting_processing", label: "Ожидают обработки" },
  { id: "completed", label: "Завершённые" },
];

const resultOf = (s: AuditSession) => (s.checks.length ? computeRecommendation(s.checks) : null);

export function AuditsListPage() {
  const { sessions, error } = useSessions();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const list = (sessions ?? []).filter(
    (s) => (filter === "all" || s.status === filter) && s.title.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const all = sessions ?? [];
  const allDemo = all.length > 0 && all.every((s) => s.isDemo);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Проверки</h1>
            {allDemo && <DemoBadge />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            В каждой проверке — отчёт и первичные документы, по которым он сверяется
          </p>
        </div>
        <Button asChild>
          <Link to="/new"><Plus /> Новая проверка</Link>
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}. Демонстрационные проверки по-прежнему доступны, подменять ими загруженные комплекты приложение не будет.
          {error.includes("Войдите") && (
            <span> <Link to="/login" className="underline underline-offset-4">Войти</Link> или <Link to="/register" className="underline underline-offset-4">создать аккаунт</Link>.</span>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию" className="h-8 pl-8" />
        </div>
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <Button
              variant="ghost"
              size="sm"
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn("rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground", filter === f.id && "bg-accent text-accent-foreground")}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => (
          <ProjectFolder key={s.id} session={s} showDemo={!allDemo} />
        ))}
        <Link
          to="/new"
          className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="size-5" /> Новая проверка
        </Link>
      </div>
      {sessions && list.length === 0 && <p className="mt-4 text-sm text-muted-foreground">Проверки не найдены.</p>}
      {!sessions && !error && <p className="mt-4 text-sm text-muted-foreground">Загрузка…</p>}
    </div>
  );
}

function ProjectFolder({ session: s, showDemo }: { session: AuditSession; showDemo: boolean }) {
  const r = resultOf(s);
  const counts = countByStatus(s.checks);
  const primary = s.supportingDocumentIds.length;
  return (
    <Link
      to="/audits/$id"
      params={{ id: s.id }}
      className="group flex min-h-44 flex-col rounded-xl border border-border bg-card p-4 shadow-panel transition-colors hover:border-primary/50"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <Folder className="size-5 group-hover:hidden" />
          <FolderOpen className="hidden size-5 group-hover:block" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-semibold leading-snug">{s.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(s.createdAt)}
            {s.ownerEmail ? ` · ${s.ownerEmail}` : ""}
            {s.isDemo && showDemo && " · пример"}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <FileSpreadsheet className="size-3.5" /> {s.reportDocumentId ? "Отчёт" : "Отчёт не загружен"}
        </p>
        <p className="flex items-center gap-1.5">
          <Files className="size-3.5" /> {primary} {plural(primary, "первичный документ", "первичных документа", "первичных документов")}
        </p>
        {s.processingError && <p className="text-destructive">{s.processingError}</p>}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
        {s.checks.length > 0 && (
          <span className="flex items-center gap-2">
            {statusOrder.map((status) =>
              counts[status] ? (
                <span key={status} className="flex items-center gap-1 text-xs" title={checkStatusMeta[status].label}>
                  <span className={cn("size-2 rounded-full", checkStatusMeta[status].dot)} />
                  <span className="tabular">{counts[status]}</span>
                </span>
              ) : null,
            )}
          </span>
        )}
        <span className="ml-auto flex flex-wrap justify-end gap-1">
          {r ? <RecommendationBadge rec={r} /> : <SessionStatusBadge status={s.status} />}
        </span>
      </div>
    </Link>
  );
}
