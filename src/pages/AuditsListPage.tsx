import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileSpreadsheet, Files, Folder, FolderOpen, Plus, Search } from "lucide-react";
import { AccessRequest } from "@/components/audit/AccessRequest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkStatusMeta, DemoBadge, RecommendationBadge, SessionStatusBadge } from "@/components/audit/badges";
import { statusText } from "@/i18n/labels";
import { useSessions } from "@/hooks/useAudit";
import { useCopy } from "@/i18n/messages";
import { useLocale } from "@/i18n/use-locale";
import { computeRecommendation } from "@/lib/conclusion";
import { formatDate } from "@/lib/format";
import { countByStatus, statusOrder } from "@/lib/marks";
import { cn } from "@/lib/utils";
import type { AuditSession, SessionStatus } from "@/types/audit";

type Filter = "all" | SessionStatus;
const filterIds: Filter[] = ["all", "in_review", "awaiting_processing", "completed"];

const resultOf = (s: AuditSession) => (s.checks.length ? computeRecommendation(s.checks) : null);

export function AuditsListPage() {
  const t = useCopy();
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
            <h1 className="text-2xl font-semibold tracking-tight">{t.audits.title}</h1>
            {allDemo && <DemoBadge />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.audits.lead}
          </p>
        </div>
        <AccessRequest>
          <Button><Plus /> {t.audits.new}</Button>
        </AccessRequest>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}. {t.audits.apiError}
          {error.includes("Войдите") && (
            <span> <Link to="/login" className="underline underline-offset-4">{t.audits.signIn}</Link> {t.audits.or} <Link to="/register" className="underline underline-offset-4">{t.audits.createAccount}</Link>.</span>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.audits.search} className="h-8 pl-8" />
        </div>
        <div className="flex flex-wrap gap-1">
          {filterIds.map((id) => (
            <Button
              variant="ghost"
              size="sm"
              key={id}
              onClick={() => setFilter(id)}
              className={cn("rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground", filter === id && "bg-accent text-accent-foreground")}
            >
              {id === "all" ? t.filters.all : id === "in_review" ? t.filters.review : id === "awaiting_processing" ? t.filters.awaiting : t.filters.completed}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => (
          <ProjectFolder key={s.id} session={s} showDemo={!allDemo} />
        ))}
        <AccessRequest>
          <button type="button" className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
            <Plus className="size-5" /> {t.audits.new}
          </button>
        </AccessRequest>
      </div>
      {sessions && list.length === 0 && <p className="mt-4 text-sm text-muted-foreground">{t.audits.empty}</p>}
      {!sessions && !error && <p className="mt-4 text-sm text-muted-foreground">{t.audits.loading}</p>}
    </div>
  );
}

function ProjectFolder({ session: s, showDemo }: { session: AuditSession; showDemo: boolean }) {
  const t = useCopy();
  const locale = useLocale();
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
            {formatDate(s.createdAt, false, locale)}
            {s.ownerEmail ? ` · ${s.ownerEmail}` : ""}
            {s.isDemo && showDemo && ` · ${t.common.example}`}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <FileSpreadsheet className="size-3.5" /> {s.reportDocumentId ? t.audits.report : t.audits.noReport}
        </p>
        <p className="flex items-center gap-1.5">
          <Files className="size-3.5" /> {primary} {t.audits.primary}
        </p>
        {s.processingError && <p className="text-destructive">{s.processingError}</p>}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
        {s.checks.length > 0 && (
          <span className="flex items-center gap-2">
            {statusOrder.map((status) =>
              counts[status] ? (
                <span key={status} className="flex items-center gap-1 text-xs" title={statusText(t, status)}>
                  <span className={cn("size-2 rounded-full", checkStatusMeta[status].dot)} />
                  <span className="tabular">{counts[status]}</span>
                </span>
              ) : null,
            )}
          </span>
        )}
        <span className="ml-auto flex flex-wrap justify-end gap-1">
          {r ? <RecommendationBadge rec={r} /> : <SessionStatusBadge status={s.status} stage={s.processingStage} />}
        </span>
      </div>
    </Link>
  );
}
