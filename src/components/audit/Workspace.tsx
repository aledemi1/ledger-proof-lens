import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BarChart3, ChevronDown, ChevronLeft, ChevronRight, FileCheck2, List, MoreHorizontal, Plus, Quote, RotateCcw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentViewer } from "@/components/audit/DocumentViewer";
import { DocumentSwitcher } from "@/components/audit/DocumentSwitcher";
import { ReviewBar } from "@/components/audit/ReviewBar";
import { checkStatusMeta, DemoBadge, SessionStatusBadge, severityMeta } from "@/components/audit/badges";
import { SUPPORTING_EXTENSIONS } from "@/lib/documentTypes";
import { isIssue } from "@/lib/conclusion";
import { checkTitle, groupIssues, groupMatches } from "@/lib/findings";
import { readingAgainst } from "@/lib/reading";
import { evidencePlace } from "@/lib/format";
import { countByStatus, marksFor, statusOrder, type DocMark } from "@/lib/marks";
import { duplicateFileNames, formatNotice } from "@/lib/notices";
import { cn } from "@/lib/utils";
import { fill } from "@/i18n/fill";
import { categoryText, severityText, statusText } from "@/i18n/labels";
import { useCopy } from "@/i18n/messages";
import { auditService } from "@/services/auditService";
import type { AuditDocument, AuditSession, CheckResult, CheckStatus } from "@/types/audit";

import { AddDocumentsButton } from "@/components/audit/AddDocumentsButton";
import { Comparison } from "@/components/audit/Comparison";

const isNarrow = () => typeof window !== "undefined" && window.innerWidth < 1024;

export function Workspace({ session, documents }: { session: AuditSession; documents: AuditDocument[] }) {
  const t = useCopy();
  const checks = session.checks;
  const report = documents.find((d) => d.id === session.reportDocumentId) ?? documents.find((d) => d.type === "report") ?? null;
  const sources = useMemo(() => documents.filter((d) => d.id !== report?.id), [documents, report?.id]);
  const duplicateNames = useMemo(() => new Set(duplicateFileNames(session.notices)), [session.notices]);
  const quietNotices = (session.notices ?? []).filter((notice) => notice.code !== "duplicate_file").map((notice) => formatNotice(notice, t));
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
  const [picked, setPicked] = useState<{ text: string; anchor: string | null } | null>(null);
  const [searching, setSearching] = useState(false);
  const searchPicked = async () => {
    if (!picked) return;
    if (session.isDemo) {
      toast.message(t.work.demoLocked);
      return;
    }
    setSearching(true);
    try {
      const check = await auditService.findIndicator(session.id, picked);
      setPicked(null);
      setSelectedId(check.id);
      toast.success(t.work.checked);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : t.work.checkFailed);
    } finally {
      setSearching(false);
    }
  };
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
      <header className="border-b border-border bg-card px-3 py-2 lg:px-4 lg:pr-36">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="size-8 shrink-0" aria-label={t.work.backToAudits}>
            <Link to="/audits"><ArrowLeft /></Link>
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold" title={session.title}>{session.title}</h1>
          {session.isDemo && <DemoBadge className="hidden shrink-0 sm:inline-flex" />}
          {session.isDemo && <span className="shrink-0 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warning sm:hidden">{t.common.demo}</span>}
          <span className="hidden whitespace-nowrap text-xs text-muted-foreground md:inline">{t.work.reviewed} <b className="text-foreground tabular">{reviewed}</b> {t.work.of} {allIssues.length}</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="shrink-0"><BarChart3 /> <span className="hidden lg:inline">{t.work.summary}</span></Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <p className="mb-1 text-xs font-medium">{fill(t.work.results, { n: checks.length })}</p>
              <p className="mb-2 text-[11px] text-muted-foreground">{t.work.hideHint}</p>
              <div className="space-y-1">
                {statusOrder.map((status) => {
                  const off = hidden.has(status);
                  return (
                    <button key={status} onClick={() => toggle(status)} aria-pressed={!off} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted", off && "opacity-40 line-through")}>
                      <span className={cn("size-2 rounded-full", checkStatusMeta[status].dot)} />
                      {categoryText(t, status)}
                      <span className="ml-auto font-semibold tabular">{totals[status]}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">{t.work.auditStatus}: <SessionStatusBadge status={session.status} /></div>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={t.work.more}><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={async () => {
                  await auditService.resetReviews(session.id);
                  toast.success(t.work.resetDone);
                }}
              >
                <RotateCcw /> {t.work.reset}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {report && !session.isDemo && (
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <a href={`/api/audits/${session.id}/files/${report.id}`}>{t.work.downloadFile}</a>
            </Button>
          )}
          {report && !session.isDemo && report.name.toLowerCase().endsWith(".xlsx") && (
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <a href={`/api/audits/${session.id}/files/${report.id}?revised=1`}>{t.work.downloadRevised}</a>
            </Button>
          )}
          <Button asChild size="sm" className="shrink-0">
            <Link to="/audits/$id/conclusion" params={{ id: session.id }}>
              <FileCheck2 /> <span className="hidden sm:inline">{t.work.toConclusion}</span>
            </Link>
          </Button>
        </div>
        {(quietNotices.length > 0 || fileProblems.length > 0 || session.recheck || session.processingError) && (
          <p className="mt-1 truncate text-[11px] text-muted-foreground" title={[...quietNotices, ...fileProblems.map((file) => `${file.fileName}: ${file.reason}`)].join(" ")}>
            {session.processingError ? `${session.processingError} ` : ""}
            {fileProblems.length > 0 ? `${fill(t.work.unread, { n: fileProblems.length })} ` : ""}
            {quietNotices[0] ?? ""}
            {session.recheck ? ` ${fill(t.work.recheck, { title: session.recheck.previousTitle, closed: session.recheck.closed, remaining: session.recheck.remaining, appeared: session.recheck.appeared })}` : ""}
          </p>
        )}
      </header>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-2">
        <section className="workspace-report flex min-h-[60vh] flex-col border-border bg-card lg:min-h-0 lg:border-r">
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 text-sm">
            <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => stepIssue(-1)} disabled={!issues.length} aria-label={t.work.prevIssue}><ChevronLeft /></Button>
            {selected && issuePos >= 0 ? (
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className={cn("size-2 shrink-0 rounded-full", checkStatusMeta[selected.status].dot)} />
                <span className="truncate font-medium" title={checkTitle(selected)}>{checkTitle(selected)}</span>
                <span className="shrink-0 text-muted-foreground tabular">· {issuePos + 1} {t.work.of} {issues.length}</span>
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {issues.length ? fill(t.work.issues, { n: issues.length }) : allIssues.length ? t.work.hidden : t.work.none}
              </span>
            )}
            <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => stepIssue(1)} disabled={!issues.length} aria-label={t.work.nextIssue}><ChevronRight /></Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs" disabled={!issues.length}><List /> {t.work.all}</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[28rem] p-2">
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.work.search} className="h-8 text-sm" />
                <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} />
                  {t.work.onlyOpen}
                </label>
                <div className="mt-2 max-h-96 space-y-1 overflow-auto">
                  {visibleGroups.map((group, index) => (
                    <div key={group.key}>
                      <button onClick={() => { select(group.primary.id); setExpanded(expanded === group.key ? null : group.key); }} className={cn("flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted", (group.primary.id === selectedId || group.related.some((check) => check.id === selectedId)) && "bg-accent")}>
                        <span className="w-5 shrink-0 text-xs text-muted-foreground tabular">{index + 1}</span>
                        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", checkStatusMeta[group.primary.status].dot)} />
                        <span className="min-w-0 flex-1 whitespace-normal">{group.title}{group.related.length ? ` · ${fill(t.work.moreRelated, { n: group.related.length })}` : ""}</span>
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
                  {visibleGroups.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">{t.work.noFilter}</p>}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {picked && (
            <div className="no-print flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={picked.text}>{t.work.pickToCheck}: <b className="text-foreground">{picked.text}</b></span>
              <Button size="sm" className="h-7" disabled={searching} onClick={() => void searchPicked()}>{searching ? t.work.checking : fill(t.work.checkThis, { text: picked.text.slice(0, 40) })}</Button>
              <Button size="sm" variant="ghost" className="h-7" disabled={searching} onClick={() => setPicked(null)}>{t.common.cancel}</Button>
            </div>
          )}
          <div className="min-h-0 flex-1">
            <DocumentViewer doc={report} marks={reportMarks} focus={selected?.reportReference ?? null} onMarkClick={onReportMark} onTextSelect={setPicked} emptyText={t.work.noReport} />
          </div>
        </section>

        <section id="selected-source" className="workspace-source flex min-h-[60vh] flex-col bg-card lg:min-h-0">
          <div className="min-h-0 flex-1">
            <DocumentViewer
              doc={sources.find((d) => d.id === sourceId) ?? null}
              marks={sourceMarks}
              focus={sourceFocus}
              onMarkClick={onSourceMark}
              emptyText={t.work.pickSource}
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
                    editable={!session.isDemo}
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

