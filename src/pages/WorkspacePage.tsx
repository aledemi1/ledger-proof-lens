import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  FileText,
  MessageSquare,
  RotateCcw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocumentViewer } from "@/components/audit/DocumentViewer";
import { CheckDetails } from "@/components/audit/CheckDetails";
import { AwaitingProcessing } from "@/components/audit/AwaitingProcessing";
import { checkStatusMeta, CheckStatusBadge, DemoBadge, SessionStatusBadge } from "@/components/audit/badges";
import { useAuditSession } from "@/hooks/useAudit";
import { isIssue } from "@/lib/conclusion";
import { cn } from "@/lib/utils";
import { auditService } from "@/services/auditService";
import type { AuditDocument, CheckResult, CheckStatus } from "@/types/audit";

type StatusFilter = "all" | CheckStatus;

export function WorkspacePage({ id }: { id: string }) {
  const { session, documents, loading } = useAuditSession(id);

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Загрузка проверки…</div>;
  if (!session)
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Проверка не найдена.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/audits">К списку проверок</Link></Button>
      </div>
    );
  if (session.status === "awaiting_processing" || session.checks.length === 0)
    return <AwaitingProcessing session={session} documents={documents} />;

  return <Workspace sessionId={id} checks={session.checks} documents={documents} title={session.title} status={session.status} isDemo={session.isDemo} />;
}

function Workspace({
  sessionId,
  checks,
  documents,
  title,
  status,
  isDemo,
}: {
  sessionId: string;
  checks: CheckResult[];
  documents: AuditDocument[];
  title: string;
  status: "in_review" | "completed" | "awaiting_processing";
  isDemo: boolean;
}) {
  const issues = useMemo(() => checks.filter(isIssue), [checks]);
  const [selectedId, setSelectedId] = useState<string>(() => issues[0]?.id ?? checks[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [docFilter, setDocFilter] = useState<string>("all");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [evIdx, setEvIdx] = useState(0);
  const [viewerDoc, setViewerDoc] = useState<string | null>(null);

  const selected = checks.find((c) => c.id === selectedId) ?? null;
  const docName = (docId: string) => documents.find((d) => d.id === docId)?.name ?? docId;

  // Open the evidence document when the selection changes.
  useEffect(() => {
    setEvIdx(0);
    const first = selected?.evidenceReferences[0];
    if (first) setViewerDoc(first.documentId);
    else if (!viewerDoc) setViewerDoc(documents.find((d) => d.type !== "report")?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const evidence = selected?.evidenceReferences[evIdx] ?? null;
  const [focusOverride, setFocusOverride] = useState<typeof evidence>(null);
  useEffect(() => setFocusOverride(null), [selectedId, evIdx]);
  const activeEvidence = selected?.status === "not_found" && !focusOverride ? null : focusOverride ?? evidence;

  const anchorToCheck = useMemo(() => {
    const m = new Map<string, string>();
    checks.forEach((c) => {
      c.evidenceReferences.forEach((e) => e.locationInDocument && m.set(e.locationInDocument, c.id));
      if (c.reportReference?.locationInDocument) m.set(c.reportReference.locationInDocument, c.id);
    });
    return m;
  }, [checks]);
  const linked = useMemo(() => new Set(anchorToCheck.keys()), [anchorToCheck]);

  const filtered = checks.filter((c) => {
    if (onlyIssues && !isIssue(c)) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (docFilter !== "all" && !c.evidenceReferences.some((e) => e.documentId === docFilter)) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${c.fieldName} ${c.reportValue} ${c.sourceValue ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const issuePos = selected ? issues.findIndex((c) => c.id === selected.id) : -1;
  const reviewed = issues.filter((c) => c.reviewerStatus !== "pending").length;

  const select = (cid: string, openDoc = false) => {
    setSelectedId(cid);
    if (openDoc && window.innerWidth < 1024) document.getElementById("selected-source")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const stepIssue = (dir: -1 | 1) => {
    if (!issues.length) return;
    const next = issuePos < 0 ? (dir === 1 ? 0 : issues.length - 1) : (issuePos + dir + issues.length) % issues.length;
    const n = issues[next];
    if (n) setSelectedId(n.id);
  };

  // Keyboard: ↑/↓ moves through visible rows, J/K through issues.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [role=combobox], [role=listbox]")) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = filtered.findIndex((c) => c.id === selectedId);
        const n = filtered[Math.min(filtered.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))];
        if (n) setSelectedId(n.id);
      } else if (e.key === "j") stepIssue(1);
      else if (e.key === "k") stepIssue(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const row = document.querySelector<HTMLElement>(`[data-row="${selectedId}"]`);
    const container = row?.closest<HTMLElement>(".results-scroll");
    if (row && container) container.scrollTop = Math.max(0, container.scrollTop + row.getBoundingClientRect().top - container.getBoundingClientRect().top - 70);
  }, [selectedId]);

  const onMarkClick = (anchor: string) => {
    const cid = anchorToCheck.get(anchor);
    if (!cid) return;
    if (cid !== selectedId) setSelectedId(cid);
    else if (anchor.startsWith("rep-") && selected?.reportReference) setFocusOverride(selected.reportReference);
  };

  const showInReport = () => {
    if (!selected?.reportReference) return;
    setViewerDoc(selected.reportReference.documentId);
    setFocusOverride(selected.reportReference);
    if (window.innerWidth < 1024) document.getElementById("selected-source")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const showEvidence = (i: number) => {
    if (!selected) return;
    const e = selected.evidenceReferences[i];
    if (!e) return;
    setEvIdx(i);
    setFocusOverride(null);
    setViewerDoc(e.documentId);
    if (window.innerWidth < 1024) document.getElementById("selected-source")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const stats = {
    total: checks.length,
    match: checks.filter((c) => c.status === "match").length,
    issues: checks.filter((c) => c.status === "mismatch" || c.status === "not_found").length,
    review: checks.filter((c) => c.status === "needs_review").length,
  };

  const sourceDocs = documents.filter((d) => d.type !== "report");

  return (
    <div className="audit-workspace flex flex-col lg:h-screen">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 pb-3 pt-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button asChild variant="ghost" size="icon" className="size-8 shrink-0" aria-label="К списку проверок">
            <Link to="/audits"><ArrowLeft /></Link>
          </Button>
          <div className="min-w-0 basis-[calc(100%-44px)] lg:flex-1 lg:basis-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-semibold sm:text-lg">{title}</h1>
              <SessionStatusBadge status={status} />
              {isDemo && <DemoBadge />}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {documents.length} документов · Рассмотрено {reviewed} из {issues.length} замечаний
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await auditService.resetReviews(sessionId);
                toast.success("Решения проверяющего сброшены");
              }}
            >
              <RotateCcw /> Сбросить решения
            </Button>
            <Button asChild size="sm">
              <Link to="/audits/$id/conclusion" params={{ id: sessionId }}>
                <FileCheck2 /> К заключению
              </Link>
            </Button>
          </div>
        </div>

        {/* Summary strip */}
        <div className="mt-2 hidden flex-wrap items-center gap-x-6 gap-y-2 text-sm xl:flex">
          <Stat label="Всего показателей" value={stats.total} />
          <Stat label="Подтверждено" value={stats.match} dot="bg-success" onClick={() => setStatusFilter("match")} />
          <Stat label="Выявлено замечаний" value={stats.issues} dot="bg-danger" onClick={() => { setStatusFilter("all"); setOnlyIssues(true); }} />
          <Stat label="Требуют ручной проверки" value={stats.review} dot="bg-warning" onClick={() => setStatusFilter("needs_review")} />
          <div className="ml-auto flex min-w-56 items-center gap-2">
            <span className="whitespace-nowrap text-xs text-muted-foreground">Рассмотрено {reviewed} из {issues.length}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${issues.length ? (reviewed / issues.length) * 100 : 100}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)]">
        {/* Left: results */}
        <section className={cn("flex min-h-0 flex-col border-border lg:border-r", "workspace-results")}>
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2 lg:px-6">
            <div className="relative min-w-40 flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по показателям" className="h-8 pl-8" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="h-8 w-auto min-w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {(Object.keys(checkStatusMeta) as CheckStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{checkStatusMeta[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={docFilter} onValueChange={setDocFilter}>
              <SelectTrigger className="h-8 w-auto min-w-36 max-w-52 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все документы</SelectItem>
                {sourceDocs.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={onlyIssues} onCheckedChange={setOnlyIssues} />
              Только проблемные
            </label>
          </div>

          <div className="results-scroll relative min-h-0 flex-1 overflow-auto bg-card">
            <table className="results-table w-full table-fixed text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 text-left text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                <tr>
                  <th className="w-[35%] py-2 pl-4 pr-2 font-medium">Показатель</th>
                  <th className="w-[20%] px-2 py-2 text-right font-medium">В отчёте</th>
                  <th className="w-[20%] px-2 py-2 text-right font-medium">В документе</th>
                  <th className="px-2 py-2 font-medium">Результат</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const active = c.id === selectedId;
                  const ev0 = c.evidenceReferences[0];
                  return (
                    <tr
                      key={c.id}
                      data-row={c.id}
                      onClick={() => select(c.id, false)}
                      className={cn(
                        "cursor-pointer border-b border-border transition-colors hover:bg-accent/60",
                        active && "bg-accent hover:bg-accent",
                      )}
                    >
                      <td className={cn("relative py-2 pl-4 pr-2 lg:pl-6", active && "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary")}>
                        <div className="flex items-center gap-1.5 font-medium">
                          <span className={cn("size-1.5 shrink-0 rounded-full", checkStatusMeta[c.status].dot)} />
                          {c.fieldName}
                        </div>
                      <div className="mt-1">
                        {ev0 ? (
                          <Button variant="link"
                            onClick={(e) => {
                              e.stopPropagation();
                              select(c.id, true);
                            }}
                            className="h-auto max-w-full justify-start gap-1 whitespace-normal p-0 text-left text-xs text-primary"
                          >
                            <FileText className="size-3.5 shrink-0" />
                            <span className="truncate">{docName(ev0.documentId)}</span>
                            <span className="shrink-0 text-muted-foreground">· с. {ev0.pageNumber}</span>
                            {c.evidenceReferences.length > 1 && <span className="shrink-0 rounded bg-primary-soft px-1">+{c.evidenceReferences.length - 1}</span>}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Не найден</span>
                        )}
                      </div>
                        {isIssue(c) && c.reviewerStatus !== "pending" && (
                          <div className={cn("ml-3 mt-0.5 text-[11px]", c.reviewerStatus === "confirmed" ? "text-danger" : "text-success")}>
                            {c.reviewerStatus === "confirmed" ? "Замечание подтверждено" : "Проверено вручную"}
                            {c.reviewerComment && <MessageSquare className="ml-1 inline size-3" />}
                          </div>
                        )}
                        {(!isIssue(c) || c.reviewerStatus === "pending") && c.reviewerComment && (
                          <div className="ml-3 mt-0.5 text-[11px] text-muted-foreground"><MessageSquare className="inline size-3" /> есть комментарий</div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular"><span className={cn("value-text", /[₽]|шт\./.test(c.reportValue) && "whitespace-nowrap")}>{c.reportValue}</span></td>
                      <td className="px-2 py-2 text-right tabular">
                        {c.sourceValue ? <span className={cn("value-text", /[₽]|шт\./.test(c.sourceValue) && "whitespace-nowrap")}>{c.sourceValue}</span> : <span className="text-muted-foreground">—</span>}
                        {c.discrepancy && <div className="text-xs font-semibold text-danger">Δ {c.discrepancy}</div>}
                      </td>
                      <td className="px-2 py-2"><CheckStatusBadge status={c.status} className="max-w-full whitespace-normal rounded-md leading-tight" /></td>

                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      Нет показателей по заданным условиям.{" "}
                      <Button variant="link" className="h-auto p-0" onClick={() => { setSearch(""); setStatusFilter("all"); setDocFilter("all"); setOnlyIssues(false); }}>
                        Сбросить фильтры
                      </Button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Issue navigator + details */}
          <div className="border-t border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-1.5 text-xs lg:px-6">
              <span className="text-muted-foreground">
                {issuePos >= 0 ? <>Замечание <b className="text-foreground">{issuePos + 1}</b> из {issues.length}</> : <>Замечаний: {issues.length}</>}
              </span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => stepIssue(-1)}><ChevronUp /> Пред.</Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => stepIssue(1)}>След. <ChevronDown /></Button>

            </div>
            {selected && (
              <CheckDetails
                key={selected.id}
                sessionId={sessionId}
                check={selected}
                docName={docName}
                onShowEvidence={showEvidence}
                onShowReport={selected.reportReference ? showInReport : undefined}
              />
            )}
          </div>
        </section>

        {/* Right: document */}
        <section id="selected-source" className="workspace-source min-h-[560px] bg-card lg:min-h-0">
          <DocumentViewer
            documents={documents}
            docId={viewerDoc}
            onDocChange={(d) => { setViewerDoc(d); setFocusOverride(null); const i = selected?.evidenceReferences.findIndex((e) => e.documentId === d) ?? -1; if (i >= 0) setEvIdx(i); }}
            evidence={activeEvidence}
            evidenceIndex={evIdx}
            evidenceCount={focusOverride ? 1 : selected?.evidenceReferences.length ?? 0}
            onEvidenceStep={(dir) => {
              const n = selected?.evidenceReferences.length ?? 0;
              if (n) showEvidence((evIdx + dir + n) % n);
            }}
            sourceDocIds={selected?.evidenceReferences.map((e) => e.documentId) ?? []}
            linkedAnchors={selected?.status === "not_found" && !focusOverride ? new Set() : linked}
            onMarkClick={onMarkClick}
            notFoundNotice={
              selected?.status === "not_found" && !focusOverride
                ? `Для показателя «${selected.fieldName}» подтверждающий фрагмент не найден ни в одном из ${sourceDocs.length} документов. Вы можете просмотреть документы вручную.`
                : null
            }
          />
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, dot, onClick }: { label: string; value: number; dot?: string; onClick?: () => void }) {
  const contents = <>{dot && <span className={cn("size-2 translate-y-[-1px] self-center rounded-full", dot)} />}<span className="text-lg font-semibold tabular">{value}</span><span className="text-xs text-muted-foreground">{label}</span></>;
  if (onClick) return <Button variant="ghost" className="h-auto justify-start gap-2 p-0 text-left" onClick={onClick}>{contents}</Button>;
  return (
    <div className="flex items-baseline gap-2 text-left">{contents}</div>
  );
}
