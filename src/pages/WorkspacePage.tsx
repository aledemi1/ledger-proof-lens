import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BarChart3, ChevronDown, ChevronLeft, ChevronRight, FileCheck2, List, MoreHorizontal, Quote, RotateCcw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DocumentViewer } from "@/components/audit/DocumentViewer";
import { DocumentSwitcher } from "@/components/audit/DocumentSwitcher";
import { ReviewBar } from "@/components/audit/ReviewBar";
import { AwaitingProcessing } from "@/components/audit/AwaitingProcessing";
import { checkStatusMeta, DemoBadge, SessionStatusBadge, severityMeta } from "@/components/audit/badges";
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
      <header className="border-b border-border bg-card px-3 py-2 lg:px-4">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="size-8 shrink-0" aria-label="К проектам">
            <Link to="/audits"><ArrowLeft /></Link>
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold" title={session.title}>{session.title}</h1>
          {session.isDemo && <DemoBadge className="hidden shrink-0 sm:inline-flex" />}
          {session.isDemo && <span className="shrink-0 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warning sm:hidden">Демо</span>}
          <span className="hidden whitespace-nowrap text-xs text-muted-foreground md:inline">Рассмотрено <b className="text-foreground tabular">{reviewed}</b> из {allIssues.length}</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="shrink-0"><BarChart3 /> <span className="hidden lg:inline">Сводка</span></Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <p className="mb-1 text-xs font-medium">Результаты · всего {checks.length}</p>
              <p className="mb-2 text-[11px] text-muted-foreground">Нажмите категорию, чтобы скрыть её на документах.</p>
              <div className="space-y-1">
                {statusOrder.map((status) => {
                  const off = hidden.has(status);
                  return (
                    <button key={status} onClick={() => toggle(status)} aria-pressed={!off} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted", off && "opacity-40 line-through")}>
                      <span className={cn("size-2 rounded-full", checkStatusMeta[status].dot)} />
                      {categoryLabel[status]}
                      <span className="ml-auto font-semibold tabular">{totals[status]}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">Статус проекта: <SessionStatusBadge status={session.status} /></div>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Дополнительные действия"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={async () => {
                  await auditService.resetReviews(session.id);
                  toast.success("Решения проверяющего сброшены");
                }}
              >
                <RotateCcw /> Сбросить решения
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild size="sm" className="shrink-0">
            <Link to="/audits/$id/conclusion" params={{ id: session.id }}>
              <FileCheck2 /> <span className="hidden sm:inline">К заключению</span>
            </Link>
          </Button>
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
        <section className="workspace-report flex min-h-[60vh] flex-col border-border bg-card lg:min-h-0 lg:border-r">
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 text-sm">
            <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => stepIssue(-1)} disabled={!issues.length} aria-label="Предыдущее замечание"><ChevronLeft /></Button>
            {selected && issuePos >= 0 ? (
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className={cn("size-2 shrink-0 rounded-full", checkStatusMeta[selected.status].dot)} />
                <span className="truncate font-medium">{selected.fieldName}</span>
                <span className="shrink-0 text-muted-foreground tabular">· {issuePos + 1} из {issues.length}</span>
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {issues.length ? `Замечаний: ${issues.length}` : allIssues.length ? "Все категории скрыты" : "Замечаний нет — все значения подтверждены"}
              </span>
            )}
            <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => stepIssue(1)} disabled={!issues.length} aria-label="Следующее замечание"><ChevronRight /></Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs" disabled={!issues.length}><List /> Все</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-1">
                {issues.map((c, i) => (
                  <button key={c.id} onClick={() => select(c.id)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted", c.id === selectedId && "bg-accent font-medium")}>
                    <span className="w-4 shrink-0 text-xs text-muted-foreground tabular">{i + 1}</span>
                    <span className={cn("size-2 shrink-0 rounded-full", checkStatusMeta[c.status].dot)} />
                    <span className="min-w-0 flex-1 truncate">{c.fieldName}</span>
                    {c.discrepancy && <span className="shrink-0 text-xs font-semibold text-danger">{c.discrepancy}</span>}
                    {c.reviewerStatus !== "pending" && <span className="shrink-0 text-xs text-muted-foreground">✓</span>}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
          <div className="min-h-0 flex-1">
            <DocumentViewer doc={report} marks={reportMarks} focus={selected?.reportReference ?? null} onMarkClick={onReportMark} emptyText="Отчёт не загружен." />
          </div>
        </section>

        <section id="selected-source" className="workspace-source flex min-h-[60vh] flex-col bg-card lg:min-h-0">
          <div className="min-h-0 flex-1">
            <DocumentViewer
              doc={sources.find((d) => d.id === sourceId) ?? null}
              marks={sourceMarks}
              focus={sourceFocus}
              onMarkClick={onSourceMark}
              emptyText="Выберите первичный документ в списке."
              title={<DocumentSwitcher documents={sources} activeId={sourceId} onSelect={showSource} counts={counts} sourceIds={sourceIds} page={sourceFocus?.pageNumber || undefined} />}
              banner={
                selected && (
                  <Comparison
                    key={selected.id}
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
      {selected && (
        <div className="no-print sticky bottom-0 z-20">
          <ReviewBar key={selected.id} sessionId={session.id} check={selected} />
        </div>
      )}
    </div>
  );
}

/** The single comparison: report value, source value, difference; explanation on demand. */
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
  const [open, setOpen] = useState(false);
  const refs = check.evidenceReferences;
  const ref = refs[evidenceIndex];
  const meta = checkStatusMeta[check.status];

  const missing = !refs.length;
  const elsewhere = !missing && (!ref || ref.documentId !== sourceId);

  return (
    <div data-status={check.status} className="border-b border-border border-l-4 border-l-[var(--mark)] bg-card px-3 py-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium", meta.cls)}>
          <meta.Icon className="size-3.5" /> {meta.label}
        </span>
        <span className="whitespace-nowrap">В отчёте <b className="text-sm tabular">{check.reportValue}</b></span>
        <span className="whitespace-nowrap">
          {missing ? <span className="text-orange">подтверждение не найдено ни в одном из {sourceCount} документов</span> : <>в документе <b className="text-sm tabular">{check.sourceValue ?? "—"}</b></>}
        </span>
        {check.discrepancy && <span className="whitespace-nowrap">разница <b className="text-sm text-danger tabular">{check.discrepancy}</b></span>}
        <span className="ml-auto flex items-center gap-0.5">
          {refs.length > 1 && (
            <>
              <span className="text-muted-foreground">Источник {evidenceIndex + 1}/{refs.length}</span>
              <Button variant="ghost" size="icon" className="size-6" onClick={() => onStep(-1)} aria-label="Предыдущий источник"><ChevronLeft /></Button>
              <Button variant="ghost" size="icon" className="size-6" onClick={() => onStep(1)} aria-label="Следующий источник"><ChevronRight /></Button>
            </>
          )}
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "Скрыть" : "Подробнее"} <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        </span>
      </div>
      {elsewhere && ref && (
        <p className="mt-1 text-muted-foreground">
          В открытом документе нет этого значения.{" "}
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onBack}>Открыть «{docName(ref.documentId)}» <ArrowRight className="size-3" /></Button>
        </p>
      )}
      {open && (
        <div className="mt-1.5 space-y-1.5 pb-1">
          <p className="rounded-md bg-muted px-2.5 py-1.5 text-[13px] leading-relaxed text-foreground/85">{check.explanation}</p>
          <p className="text-muted-foreground">Значимость: <span className={severityMeta[check.severity].cls}>{severityMeta[check.severity].label}</span></p>
          {ref && (
            <p className="flex items-start gap-1.5 text-muted-foreground">
              <Quote className="mt-0.5 size-3 shrink-0" />
              <span className="text-foreground/80">{docName(ref.documentId)} · {evidencePlace(ref)}: {ref.sourceText}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
