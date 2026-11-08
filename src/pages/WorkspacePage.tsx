import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BarChart3, ChevronDown, ChevronLeft, ChevronRight, FileCheck2, List, MoreHorizontal, Plus, Quote, RotateCcw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentViewer } from "@/components/audit/DocumentViewer";
import { DocumentSwitcher } from "@/components/audit/DocumentSwitcher";
import { ReviewBar } from "@/components/audit/ReviewBar";
import { AwaitingProcessing } from "@/components/audit/AwaitingProcessing";
import { checkStatusMeta, DemoBadge, SessionStatusBadge, severityMeta } from "@/components/audit/badges";
import { useAuditSession } from "@/hooks/useAudit";
import { SUPPORTING_EXTENSIONS } from "@/lib/documentTypes";
import { isIssue } from "@/lib/conclusion";
import { checkTitle, groupIssues, groupMatches } from "@/lib/findings";
import { readingAgainst } from "@/lib/reading";
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

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Загрузка проверки…</div>;
  if (error)
    return (
      <div className="mx-auto max-w-xl p-8">
        <p className="text-sm font-medium">Не удалось открыть проверку</p>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/audits">К проверкам</Link></Button>
      </div>
    );
  if (!session)
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Проверка не найдена.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/audits">К проверкам</Link></Button>
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
  const duplicateNames = useMemo(() => new Set((session.notices ?? []).filter((notice) => /повторяет/.test(notice)).flatMap((notice) => [...notice.matchAll(/«([^»]+)»/g)].map((match) => match[1] ?? ""))), [session.notices]);
  const quietNotices = (session.notices ?? []).filter((notice) => !/повторяет/.test(notice));
  const fileProblems = session.fileErrors ?? [];

  const [hidden, setHidden] = useState<Set<CheckStatus>>(() => new Set());
  const [query, setQuery] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const groups = useMemo(() => groupIssues(checks.filter(isIssue)), [checks]);
  const visibleGroups = useMemo(
    () => groups.filter((group) => {
      const members = [group.primary, ...group.related];
      if (members.every((check) => hidden.has(check.status))) return false;
      if (onlyOpen && members.every((check) => check.reviewerStatus !== "pending")) return false;
      if (query.trim() && !groupMatches(group, query)) return false;
      return true;
    }),
    [groups, hidden, onlyOpen, query],
  );
  const issues = visibleGroups.map((group) => group.primary);
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

  const issuePos = selected ? visibleGroups.findIndex((group) => group.primary.id === selected.id || group.related.some((check) => check.id === selected.id)) : -1;
  const stepIssue = useCallback(
    (dir: -1 | 1) => {
      if (!visibleGroups.length) return;
      const next = issuePos < 0 ? (dir === 1 ? 0 : visibleGroups.length - 1) : (issuePos + dir + visibleGroups.length) % visibleGroups.length;
      const group = visibleGroups[next];
      if (group) select(group.primary.id);
    },
    [visibleGroups, issuePos, select],
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
          <Button asChild variant="ghost" size="icon" className="size-8 shrink-0" aria-label="К проверкам">
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
              <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">Статус проверки: <SessionStatusBadge status={session.status} /></div>
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
        {(quietNotices.length > 0 || fileProblems.length > 0 || session.recheck || session.processingError) && (
          <p className="mt-1 truncate text-[11px] text-muted-foreground" title={[...quietNotices, ...fileProblems.map((file) => `${file.fileName}: ${file.reason}`)].join(" ")}>
            {session.processingError ? `${session.processingError} ` : ""}
            {fileProblems.length > 0 ? `Непрочитано файлов: ${fileProblems.length}. ` : ""}
            {quietNotices[0] ?? ""}
            {session.recheck ? ` Повтор «${session.recheck.previousTitle}»: закрылось ${session.recheck.closed}, осталось ${session.recheck.remaining}, появилось ${session.recheck.appeared}.` : ""}
          </p>
        )}
      </header>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-2">
        <section className="workspace-report flex min-h-[60vh] flex-col border-border bg-card lg:min-h-0 lg:border-r">
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 text-sm">
            <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => stepIssue(-1)} disabled={!issues.length} aria-label="Предыдущее замечание"><ChevronLeft /></Button>
            {selected && issuePos >= 0 ? (
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className={cn("size-2 shrink-0 rounded-full", checkStatusMeta[selected.status].dot)} />
                <span className="truncate font-medium" title={checkTitle(selected)}>{checkTitle(selected)}</span>
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
              <PopoverContent align="end" className="w-[28rem] p-2">
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по позиции или показателю" className="h-8 text-sm" />
                <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} />
                  Только нерассмотренные
                </label>
                <div className="mt-2 max-h-96 space-y-1 overflow-auto">
                  {visibleGroups.map((group, index) => (
                    <div key={group.key}>
                      <button onClick={() => { select(group.primary.id); setExpanded(expanded === group.key ? null : group.key); }} className={cn("flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted", (group.primary.id === selectedId || group.related.some((check) => check.id === selectedId)) && "bg-accent")}>
                        <span className="w-5 shrink-0 text-xs text-muted-foreground tabular">{index + 1}</span>
                        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", checkStatusMeta[group.primary.status].dot)} />
                        <span className="min-w-0 flex-1 whitespace-normal">{group.title}{group.related.length ? ` · ещё ${group.related.length}` : ""}</span>
                        {group.primary.discrepancy && <span className="shrink-0 text-xs font-semibold text-danger">{group.primary.discrepancy}</span>}
                      </button>
                      {expanded === group.key && group.related.map((check) => (
                        <button key={check.id} onClick={() => select(check.id)} className={cn("ml-7 flex w-[calc(100%-1.75rem)] items-start gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted", check.id === selectedId && "bg-accent")}>
                          <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", checkStatusMeta[check.status].dot)} />
                          <span className="min-w-0 flex-1 whitespace-normal">{checkTitle(check)}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                  {visibleGroups.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">Нет замечаний по этому фильтру.</p>}
                </div>
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
              title={
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <DocumentSwitcher documents={sources} activeId={sourceId} onSelect={showSource} counts={counts} sourceIds={sourceIds} page={sourceFocus?.pageNumber || undefined} duplicates={duplicateNames} />
                  <AddDocumentsButton sessionId={session.id} demo={session.isDemo} />
                </div>
              }
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
                    sourceDoc={sources.find((doc) => doc.id === sourceId) ?? null}
                    sessionId={session.id}
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
function AddDocumentsButton({ sessionId, demo }: { sessionId: string; demo: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const add = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (input.current) input.current.value = "";
    if (!files.length) return;
    const accepted = files.filter((file) => SUPPORTING_EXTENSIONS.includes(file.name.split(".").pop()?.toLowerCase() ?? ""));
    if (accepted.length !== files.length) toast.error("Часть файлов пропущена: нужен PDF, Word, Excel или изображение");
    if (!accepted.length) return;
    if (demo) {
      toast.message("Демонстрационный комплект не изменяется. В своей проверке добавленные документы сразу входят в сверку.");
      return;
    }
    try {
      await auditService.addDocuments(sessionId, accepted);
      toast.success(accepted.length === 1 ? "Документ добавлен, сверка пересчитывается" : "Документы добавлены, сверка пересчитывается");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Не удалось добавить документы");
    }
  };
  return (
    <>
      <input ref={input} type="file" className="hidden" multiple accept={SUPPORTING_EXTENSIONS.map((ext) => `.${ext}`).join(",")} onChange={(event) => void add(event.target.files)} />
      <Button variant="outline" size="icon" className="size-8 shrink-0" aria-label="Добавить первичные документы" title="Добавить первичные документы" onClick={() => {
        if (demo) {
          toast.message("Демонстрационный комплект не изменяется. В своей проверке добавленные документы сразу входят в сверку.");
          return;
        }
        input.current?.click();
      }}>
        <Plus />
      </Button>
    </>
  );
}

function previewFragments(doc: AuditDocument): { anchor: string; text: string; label: string }[] {
  if (doc.preview.kind === "grid") {
    return doc.preview.sheets.flatMap((sheet) => sheet.rows.flatMap((row) => row.cells.filter((cell) => cell.text.trim()).map((cell) => ({
      anchor: cell.anchor,
      text: cell.text,
      label: `Лист «${sheet.name}», ${cell.address}`,
    }))));
  }
  if (doc.preview.kind === "flow") {
    return doc.preview.blocks.flatMap((block) => {
      if (block.kind === "paragraph" && block.anchor && block.text?.trim()) return [{ anchor: block.anchor, text: block.text, label: "Абзац" }];
      if (block.kind === "table" && block.rows) {
        return block.rows.flatMap((row) => row.cells.filter((cell) => cell.text.trim()).map((cell) => ({ anchor: cell.anchor, text: cell.text, label: "Таблица" })));
      }
      return [];
    });
  }
  return [];
}

function FragmentPicker({
  doc,
  query,
  onQuery,
  onPick,
}: {
  doc: AuditDocument | null;
  query: string;
  onQuery: (value: string) => void;
  onPick: (fragment: { anchor: string; text: string; label: string }) => void;
}) {
  const fragments = doc ? previewFragments(doc) : [];
  const shown = fragments.filter((fragment) => `${fragment.label} ${fragment.text}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 40);
  if (!doc) return <p className="text-muted-foreground">Сначала откройте первичный документ.</p>;
  if (!fragments.length) return <p className="text-muted-foreground">В этом предпросмотре нет отдельных строк, которые можно выбрать.</p>;
  return (
    <div className="rounded-md border border-border p-2">
      <Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Найти строку или фрагмент" className="h-7 text-xs" />
      <div className="mt-1 max-h-40 overflow-auto">
        {shown.map((fragment) => (
          <button key={fragment.anchor} type="button" className="block w-full truncate rounded px-1 py-1 text-left hover:bg-muted" onClick={() => onPick(fragment)}>
            <span className="text-muted-foreground">{fragment.label}: </span>{fragment.text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Comparison({
  check,
  evidenceIndex,
  sourceId,
  sourceCount,
  docName,
  onStep,
  onBack,
  sourceDoc,
  sessionId,
}: {
  check: CheckResult;
  evidenceIndex: number;
  sourceId: string | null;
  sourceCount: number;
  docName: (id: string) => string;
  onStep: (dir: -1 | 1) => void;
  onBack: () => void;
  sourceDoc: AuditDocument | null;
  sessionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [fragmentQuery, setFragmentQuery] = useState("");
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
          {refs.length > 1 && (
            <div>
              <p className="font-medium text-muted-foreground">Состав расчёта</p>
              <ul className="mt-1 space-y-0.5">
                {refs.map((item) => (
                  <li key={`${item.documentId}-${item.locationInDocument ?? item.sourceText}`}>{docName(item.documentId)} · {evidencePlace(item)}: {item.sourceText}</li>
                ))}
              </ul>
            </div>
          )}
          {check.reviewerSource && (
            <p className="rounded-md bg-muted px-2.5 py-1.5">
              Выбранный фрагмент: {check.reviewerSource.sourceText}. {readingAgainst(check.reportValue, check.reviewerSource).note}
              {readingAgainst(check.reportValue, check.reviewerSource).discrepancy ? ` Разница ${readingAgainst(check.reportValue, check.reviewerSource).discrepancy}.` : ""}
              {" "}Автоматический статус «{meta.label}» не изменён.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setPicking((value) => !value)}>Выбран неверный документ</Button>
            {check.reviewerSource && (
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => auditService.updateReview(sessionId, check.id, { reviewerSource: null })}>Сбросить выбор</Button>
            )}
          </div>
          {picking && (
            <FragmentPicker
              doc={sourceDoc}
              query={fragmentQuery}
              onQuery={setFragmentQuery}
              onPick={(fragment) => {
                if (!sourceDoc) return;
                void auditService.updateReview(sessionId, check.id, {
                  reviewerSource: {
                    documentId: sourceDoc.id,
                    pageNumber: 1,
                    sourceText: fragment.text,
                    locationInDocument: fragment.anchor,
                    locationLabel: fragment.label,
                  },
                });
                setPicking(false);
              }}
            />
          )}
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
