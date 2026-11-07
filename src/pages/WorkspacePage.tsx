import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, FileCheck2, FileX2, Folder, Quote, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DocumentViewer } from "@/components/audit/DocumentViewer";
import { DocumentCarousel } from "@/components/audit/DocumentCarousel";
import { CheckDetails } from "@/components/audit/CheckDetails";
import { AwaitingProcessing } from "@/components/audit/AwaitingProcessing";
import { checkStatusMeta, DemoBadge, SessionStatusBadge } from "@/components/audit/badges";
import { useAuditSession } from "@/hooks/useAudit";
import { isIssue } from "@/lib/conclusion";
import { evidencePlace } from "@/lib/format";
import { countByStatus, marksFor, statusOrder, type DocMark } from "@/lib/marks";
import { cn } from "@/lib/utils";
import { auditService } from "@/services/auditService";
import type { AuditDocument, AuditSession, CheckResult, CheckStatus } from "@/types/audit";

const categoryLabel: Record<CheckStatus, string> = {
  mismatch: "Расхождения",
  not_found: "Нет подтверждения",
  needs_review: "Ручная проверка",
  match: "Совпадает",
};

const isNarrow = () => typeof window !== "undefined" && window.innerWidth < 1024;

export function WorkspacePage({ id }: { id: string }) {
  const { session, documents, loading, error } = useAuditSession(id);

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Загрузка проекта…</div>;
  if (error)
    return (
      <div className="mx-auto max-w-xl p-8">
        <p className="text-sm font-medium">Не удалось открыть проект</p>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/audits">К проектам</Link></Button>
      </div>
    );
  if (!session)
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Проект не найден.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/audits">К проектам</Link></Button>
      </div>
    );
  if (session.status === "awaiting_processing" || session.checks.length === 0)
    return <AwaitingProcessing session={session} documents={documents} />;

  return <Workspace session={session} documents={documents} />;
}

function Workspace({ session, documents }: { session: AuditSession; documents: AuditDocument[] }) {
  const checks = session.checks;
  const report = documents.find((d) => d.id === session.reportDocumentId) ?? documents.find((d) => d.type === "report") ?? null;
  const sources = useMemo(() => documents.filter((d) => d.id !== report?.id), [documents, report?.id]);
  const notices = [...(session.notices ?? []), ...(session.fileErrors?.map((file) => `«${file.fileName}»: ${file.reason}`) ?? [])];

  const [hidden, setHidden] = useState<Set<CheckStatus>>(() => new Set());
  const issues = useMemo(() => checks.filter((c) => isIssue(c) && !hidden.has(c.status)), [checks, hidden]);
  const firstIssue = checks.find(isIssue) ?? checks[0];
  const [selectedId, setSelectedId] = useState<string>(firstIssue?.id ?? "");
  const [sourceId, setSourceId] = useState<string | null>(firstIssue?.evidenceReferences[0]?.documentId ?? sources[0]?.id ?? null);
  const [evIdx, setEvIdx] = useState(0);

  const selected = checks.find((c) => c.id === selectedId) ?? null;
  const docName = (docId: string) => documents.find((d) => d.id === docId)?.name ?? docId;

  /** Select a check and open the primary document that proves or contradicts it. */
  const select = useCallback(
    (checkId: string, from?: { documentId: string; anchor?: string | undefined }) => {
      const check = checks.find((c) => c.id === checkId);
      if (!check) return;
      setSelectedId(checkId);
      const refs = check.evidenceReferences;
      let index = from ? refs.findIndex((e) => e.documentId === from.documentId && e.locationInDocument === from.anchor) : -1;
      if (index < 0 && from) index = refs.findIndex((e) => e.documentId === from.documentId);
      if (index < 0) index = 0;
      setEvIdx(index);
      const ref = refs[index];
      if (ref) setSourceId(ref.documentId);
      if (isNarrow() && from?.documentId !== ref?.documentId) document.getElementById("selected-source")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [checks],
  );

  const showSource = (docId: string) => {
    setSourceId(docId);
    const i = selected?.evidenceReferences.findIndex((e) => e.documentId === docId) ?? -1;
    if (i >= 0) setEvIdx(i);
  };
  const stepEvidence = (dir: -1 | 1) => {
    const refs = selected?.evidenceReferences ?? [];
    if (refs.length < 2) return;
    const next = (evIdx + dir + refs.length) % refs.length;
    setEvIdx(next);
    const ref = refs[next];
    if (ref) setSourceId(ref.documentId);
  };

  const issuePos = selected ? issues.findIndex((c) => c.id === selected.id) : -1;
  const stepIssue = useCallback(
    (dir: -1 | 1) => {
      if (!issues.length) return;
      const next = issuePos < 0 ? (dir === 1 ? 0 : issues.length - 1) : (issuePos + dir + issues.length) % issues.length;
      const n = issues[next];
      if (n) select(n.id);
    },
    [issues, issuePos, select],
  );

  // Keyboard: J/K or ↓/↑ move through problems.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [role=combobox], [role=listbox]")) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        stepIssue(1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        stepIssue(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepIssue]);

  useEffect(() => {
    document.querySelector<HTMLElement>(`[data-issue="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedId]);

  const shown = useMemo(() => checks.filter((c) => !hidden.has(c.status) || c.id === selectedId), [checks, hidden, selectedId]);
  const reportMarks = useMemo(() => (report ? marksFor(report.id, shown, true) : []), [report, shown]);
  const sourceMarks = useMemo(() => (sourceId ? marksFor(sourceId, shown, false) : []), [sourceId, shown]);
  const counts = useMemo(() => {
    const map = new Map<string, Record<CheckStatus, number>>();
    for (const doc of sources) map.set(doc.id, countByStatus(checks.filter((c) => c.evidenceReferences.some((e) => e.documentId === doc.id))));
    return map;
  }, [sources, checks]);
  const totals = useMemo(() => countByStatus(checks), [checks]);
  const allIssues = checks.filter(isIssue);
  const reviewed = allIssues.filter((c) => c.reviewerStatus !== "pending").length;

  const evidence = selected?.evidenceReferences[evIdx] ?? null;
  const sourceFocus = evidence && evidence.documentId === sourceId ? evidence : null;
  const sourceIds = useMemo(() => new Set(selected?.evidenceReferences.map((e) => e.documentId) ?? []), [selected]);

  const onReportMark = useCallback((mark: DocMark) => select(mark.checkId), [select]);
  const onSourceMark = useCallback(
    (mark: DocMark) => sourceId && select(mark.checkId, { documentId: sourceId, anchor: mark.anchor }),
    [select, sourceId],
  );

  const toggle = (status: CheckStatus) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });

  return (
    <div className="audit-workspace flex flex-col lg:h-screen">
      <header className="border-b border-border bg-card px-4 py-2.5 lg:px-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button asChild variant="ghost" size="icon" className="size-8 shrink-0" aria-label="К проектам">
            <Link to="/audits"><ArrowLeft /></Link>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link to="/audits" className="hover:text-primary">Проекты</Link>
              <ChevronRight className="size-3" />
              <Folder className="size-3.5" />
              <span className="truncate">{session.title}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-semibold">{session.title}</h1>
              <SessionStatusBadge status={session.status} />
              {session.isDemo && <DemoBadge />}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Категории проблем">
            {statusOrder.map((status) => {
              const off = hidden.has(status);
              return (
                <button
                  key={status}
                  onClick={() => toggle(status)}
                  aria-pressed={!off}
                  title={off ? "Показать на документах" : "Скрыть с документов"}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity",
                    checkStatusMeta[status].cls,
                    "border-transparent",
                    off && "opacity-40 line-through",
                  )}
                >
                  <span className={cn("size-2 rounded-full", checkStatusMeta[status].dot)} />
                  {categoryLabel[status]}
                  <span className="tabular">{totals[status]}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="hidden whitespace-nowrap text-xs text-muted-foreground xl:inline">Рассмотрено {reviewed} из {allIssues.length}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await auditService.resetReviews(session.id);
                toast.success("Решения проверяющего сброшены");
              }}
            >
              <RotateCcw /> <span className="hidden sm:inline">Сбросить решения</span>
            </Button>
            <Button asChild size="sm">
              <Link to="/audits/$id/conclusion" params={{ id: session.id }}>
                <FileCheck2 /> К заключению
              </Link>
            </Button>
          </div>
        </div>
        {notices.length > 0 && (
          <div className="mt-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-1.5 text-xs text-foreground">
            {notices.map((notice) => (
              <p key={notice}>{notice}</p>
            ))}
          </div>
        )}
      </header>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-2">
        {/* Left: the report with every checked value marked by category */}
        <section className="workspace-report flex min-h-0 flex-col border-border bg-card lg:border-r">
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">Отчёт</span>
              <span className="text-muted-foreground">
                {issuePos >= 0 ? <>проблема <b className="text-foreground">{issuePos + 1}</b> из {issues.length}</> : <>проблем: {issues.length}</>}
              </span>
              <div className="ml-auto flex items-center">
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => stepIssue(-1)} disabled={!issues.length}><ChevronLeft /> Пред.</Button>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => stepIssue(1)} disabled={!issues.length}>След. <ChevronRight /></Button>
              </div>
            </div>
            <div className="mt-1.5 flex max-h-[4.5rem] flex-wrap gap-1.5 overflow-y-auto">
              {issues.map((c) => (
                <button
                  key={c.id}
                  data-issue={c.id}
                  data-status={c.status}
                  onClick={() => select(c.id)}
                  className={cn(
                    "inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-xs transition-colors hover:border-[var(--mark)]",
                    c.id === selectedId && "border-[var(--mark)] bg-[color-mix(in_oklab,var(--mark)_12%,transparent)] font-medium",
                  )}
                >
                  <span className={cn("size-2 shrink-0 rounded-full", checkStatusMeta[c.status].dot)} />
                  <span className="truncate">{c.fieldName}</span>
                  {c.discrepancy && <span className="shrink-0 font-semibold text-danger">{c.discrepancy}</span>}
                  {c.reviewerStatus !== "pending" && <span className="shrink-0 text-[10px] text-muted-foreground">✓</span>}
                </button>
              ))}
              {issues.length === 0 && <span className="text-xs text-muted-foreground">{allIssues.length ? "Все категории проблем скрыты." : "Проблем не найдено — все значения подтверждены."}</span>}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <DocumentViewer
              doc={report}
              marks={reportMarks}
              focus={selected?.reportReference ?? null}
              onMarkClick={onReportMark}
              emptyText="Отчёт не загружен."
            />
          </div>
          {selected && (
            <div className="border-t border-border">
              <CheckDetails
                key={selected.id}
                sessionId={session.id}
                check={selected}
                docName={docName}
                showValues={false}
                onShowEvidence={(i) => {
                  const ref = selected.evidenceReferences[i];
                  if (!ref) return;
                  setEvIdx(i);
                  setSourceId(ref.documentId);
                }}
              />
            </div>
          )}
        </section>

        {/* Right: one primary document at a time, picked from the project carousel */}
        <section id="selected-source" className="workspace-source flex min-h-0 flex-col bg-card">
          <DocumentCarousel documents={sources} activeId={sourceId} onSelect={showSource} counts={counts} sourceIds={sourceIds} />
          <div className="min-h-0 flex-1">
            <DocumentViewer
              doc={sources.find((d) => d.id === sourceId) ?? null}
              marks={sourceMarks}
              focus={sourceFocus}
              onMarkClick={onSourceMark}
              emptyText="Выберите первичный документ в карусели."
              banner={
                selected && (
                  <Comparison
                    check={selected}
                    evidenceIndex={evIdx}
                    sourceId={sourceId}
                    sourceCount={sources.length}
                    docName={docName}
                    onStep={stepEvidence}
                    onBack={() => evidence && setSourceId(evidence.documentId)}
                  />
                )
              }
            />
          </div>
        </section>
      </div>
    </div>
  );
}

/** What the report says, what the open source says, and how they differ. */
function Comparison({
  check,
  evidenceIndex,
  sourceId,
  sourceCount,
  docName,
  onStep,
  onBack,
}: {
  check: CheckResult;
  evidenceIndex: number;
  sourceId: string | null;
  sourceCount: number;
  docName: (id: string) => string;
  onStep: (dir: -1 | 1) => void;
  onBack: () => void;
}) {
  const refs = check.evidenceReferences;
  const ref = refs[evidenceIndex];
  const meta = checkStatusMeta[check.status];

  if (!refs.length)
    return (
      <div data-status={check.status} className="flex items-start gap-2 border-b border-border border-l-4 border-l-[var(--mark)] bg-orange-soft px-3 py-2 text-xs">
        <FileX2 className="mt-0.5 size-4 shrink-0 text-orange" />
        <div>
          <p className="font-medium text-foreground">«{check.fieldName}»: в отчёте {check.reportValue}</p>
          <p className="mt-0.5 text-muted-foreground">Подтверждение не найдено ни в одном из {sourceCount} первичных документов. Пролистайте их в карусели вручную.</p>
        </div>
      </div>
    );

  if (!ref || ref.documentId !== sourceId)
    return (
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">В этом документе нет значения «{check.fieldName}».</span>
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onBack}>
          Открыть «{ref ? docName(ref.documentId) : ""}» <ArrowRight className="size-3" />
        </Button>
      </div>
    );

  return (
    <div data-status={check.status} className="border-b border-border border-l-4 border-l-[var(--mark)] bg-card px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium", meta.cls)}>
          <meta.Icon className="size-3.5" /> {meta.label}
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold">{check.fieldName}</span>
        {refs.length > 1 && (
          <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
            Источник {evidenceIndex + 1} из {refs.length}
            <Button variant="ghost" size="icon" className="size-6" onClick={() => onStep(-1)} aria-label="Предыдущий источник"><ChevronLeft /></Button>
            <Button variant="ghost" size="icon" className="size-6" onClick={() => onStep(1)} aria-label="Следующий источник"><ChevronRight /></Button>
          </div>
        )}
      </div>
      <div className="mt-1.5 grid grid-cols-[1fr_1fr_auto] items-end gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">В отчёте</p>
          <p className="break-words text-sm font-semibold tabular">{check.reportValue}</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">В источнике · {evidencePlace(ref)}</p>
          <p className="break-words text-sm font-semibold tabular">{check.sourceValue ?? "—"}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Разница</p>
          <p className={cn("text-sm font-semibold tabular", check.discrepancy ? "text-danger" : "text-muted-foreground")}>{check.discrepancy ?? (check.status === "match" ? "нет" : "—")}</p>
        </div>
      </div>
      <p className="mt-1.5 flex items-start gap-1.5 text-muted-foreground">
        <Quote className="mt-0.5 size-3 shrink-0" />
        <span className="line-clamp-2 text-foreground/80">{ref.sourceText}</span>
      </p>
    </div>
  );
}
