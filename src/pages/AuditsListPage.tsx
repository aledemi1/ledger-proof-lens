import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DemoBadge, RecommendationBadge, SessionStatusBadge } from "@/components/audit/badges";
import { useSessions } from "@/hooks/useAudit";
import { computeRecommendation } from "@/lib/conclusion";
import { formatDate } from "@/lib/format";
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
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const list = (sessions ?? []).filter(
    (s) => (filter === "all" || s.status === filter) && s.title.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const all = sessions ?? [];
  const stats = [
    { label: "Всего проверок", value: all.length, dot: "bg-primary" },
    { label: "Без замечаний", value: all.filter((s) => resultOf(s) === "accept").length, dot: "bg-success" },
    { label: "Требуют доработки", value: all.filter((s) => resultOf(s) === "revise").length, dot: "bg-danger" },
    { label: "Ожидают рассмотрения", value: all.filter((s) => s.status !== "completed").length, dot: "bg-warning" },
  ];
  const allDemo = all.length > 0 && all.every((s) => s.isDemo);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Все проверки</h1>
            {allDemo && <DemoBadge />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Результаты сверки и этапы рассмотрения отчётов
          </p>
        </div>
        <Button asChild>
          <Link to="/new"><Plus /> Новая проверка</Link>
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}. Демонстрационные проверки по-прежнему доступны, подменять ими загруженные комплекты приложение не будет.
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card px-4 py-2 shadow-panel">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("size-1.5 rounded-full", s.dot)} /> {s.label}
            </div>
            <div className="mt-0.5 text-xl font-semibold tabular">{sessions ? s.value : "—"}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-hidden border-y border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию" className="h-8 pl-8" />
          </div>
          <div className="flex flex-wrap gap-1">
            {filters.map((f) => (
              <Button variant="ghost" size="sm"
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted",
                  filter === f.id && "bg-accent text-accent-foreground",
                )}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Название проверки</th>
                <th className="px-3 py-2 font-medium">Дата создания</th>
                <th className="px-3 py-2 text-right font-medium">Документов</th>
                <th className="px-3 py-2 font-medium">Результат сверки</th>
                <th className="px-3 py-2 font-medium">Этап работы</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const r = resultOf(s);
                return (
                  <tr
                    key={s.id}
                    onClick={() => navigate({ to: "/audits/$id", params: { id: s.id } })}
                    className="cursor-pointer border-t border-border transition-colors hover:bg-accent/50"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{s.title}</div>
                      {s.isDemo && !allDemo && <div className="text-[11px] text-muted-foreground">Пример · синтетические данные</div>}
                      {!s.isDemo && <div className="text-[11px] text-muted-foreground">{s.processingError ? s.processingError : "Загруженные документы"}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{formatDate(s.createdAt)}</td>
                    <td className="px-3 py-2.5 text-right tabular">{s.supportingDocumentIds.length + (s.reportDocumentId ? 1 : 0)}</td>
                    <td className="px-3 py-2.5">{r ? <RecommendationBadge rec={r} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2.5"><SessionStatusBadge status={s.status} /></td>
                    <td className="px-4 py-2.5 text-right">
                      <Button asChild variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                        <Link to="/audits/$id" params={{ id: s.id }}>
                          {s.status === "in_review" ? "Продолжить" : "Открыть"} <ChevronRight />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {sessions && list.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">Проверки не найдены</td>
                </tr>
              )}
              {!sessions && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">Загрузка…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
