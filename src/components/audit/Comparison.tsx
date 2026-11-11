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
import { formatExplanation } from "@/lib/explanations";
import { duplicateFileNames, formatNotice } from "@/lib/notices";
import { cn } from "@/lib/utils";
import { fill } from "@/i18n/fill";
import { categoryText, severityText, statusText } from "@/i18n/labels";
import { useCopy } from "@/i18n/messages";
import { useLocale } from "@/i18n/use-locale";
import { auditService } from "@/services/auditService";
import type { AuditDocument, AuditSession, CheckResult, CheckStatus } from "@/types/audit";

import { FragmentPicker } from "@/components/audit/FragmentPicker";

export function Comparison({
  check,
  evidenceIndex,
  sourceId,
  sourceCount,
  docName,
  onStep,
  onBack,
  sourceDoc,
  sessionId,
  editable,
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
  editable: boolean;
}) {
  const t = useCopy();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [fragmentQuery, setFragmentQuery] = useState("");
  const [draft, setDraft] = useState(check.reportValue);
  const [saving, setSaving] = useState(false);
  const refs = check.evidenceReferences;
  const ref = refs[evidenceIndex];
  const meta = checkStatusMeta[check.status];

  const missing = !refs.length;
  const elsewhere = !missing && (!ref || ref.documentId !== sourceId);

  return (
    <div data-status={check.status} className="border-b border-border border-l-4 border-l-[var(--mark)] bg-card px-3 py-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium", meta.cls)}>
          <meta.Icon className="size-3.5" /> {statusText(t, check.status)}
        </span>
        <span className="whitespace-nowrap">{t.work.inReport} <b className="text-sm tabular">{check.reportValue}</b></span>
        <span className="whitespace-nowrap">
          {missing ? <span className="text-orange">{fill(t.work.notFoundIn, { n: sourceCount })}</span> : <>{t.work.inDocument} <b className="text-sm tabular">{check.sourceValue ?? "—"}</b></>}
        </span>
        {check.discrepancy && <span className="whitespace-nowrap">{t.work.difference} <b className="text-sm text-danger tabular">{check.discrepancy}</b></span>}
        {editable && check.sourceValue && check.status !== "match" && (
          <span className="text-muted-foreground">{fill(t.work.hintFill, { value: check.sourceValue })}</span>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          {refs.length > 1 && (
            <>
              <span className="text-muted-foreground">{fill(t.work.sourceN, { n: evidenceIndex + 1, total: refs.length })}</span>
              <Button variant="ghost" size="icon" className="size-6" onClick={() => onStep(-1)} aria-label={t.work.prevSource}><ChevronLeft /></Button>
              <Button variant="ghost" size="icon" className="size-6" onClick={() => onStep(1)} aria-label={t.work.nextSource}><ChevronRight /></Button>
            </>
          )}
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? t.work.hide : t.work.details} <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        </span>
      </div>
      {elsewhere && ref && (
        <p className="mt-1 text-muted-foreground">
          {t.work.notInOpen}{" "}
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onBack}>{fill(t.work.openFile, { name: docName(ref.documentId) })} <ArrowRight className="size-3" /></Button>
        </p>
      )}
      {open && (
        <div className="mt-1.5 space-y-1.5 pb-1">
          <p className="rounded-md bg-muted px-2.5 py-1.5 text-[13px] leading-relaxed text-foreground/85">{formatExplanation(check.explanation, locale)}</p>
          {editable && (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setSaving(true);
                void auditService.updateReportValue(sessionId, check.id, draft).catch((error: unknown) => {
                  toast.error(error instanceof Error ? error.message : t.work.checkFailed);
                }).finally(() => setSaving(false));
              }}
            >
              <input className="h-7 rounded-md border border-input bg-background px-2 text-sm" value={draft} onChange={(event) => setDraft(event.target.value)} />
              {check.sourceValue && (
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDraft(check.sourceValue ?? "")}>{check.sourceValue}</Button>
              )}
              <Button type="submit" size="sm" className="h-7 text-xs" disabled={saving || !draft.trim()}>{t.work.saveValue}</Button>
            </form>
          )}
          {refs.length > 1 && (
            <div>
              <p className="font-medium text-muted-foreground">{t.work.calculation}</p>
              <ul className="mt-1 space-y-0.5">
                {refs.map((item) => (
                  <li key={`${item.documentId}-${item.locationInDocument ?? item.sourceText}`}>{docName(item.documentId)} · {evidencePlace(item)}: {item.sourceText}</li>
                ))}
              </ul>
            </div>
          )}
          {check.reviewerSource && (
            <p className="rounded-md bg-muted px-2.5 py-1.5">
              {fill(t.work.chosen, { text: check.reviewerSource.sourceText })} {({ datesSame: t.work.noteDatesSame, datesDiffer: t.work.noteDatesDiffer, saved: t.work.noteSaved, same: t.work.noteSame, differ: t.work.noteDiffer, noNumber: t.work.noteNoNumber } as Record<string, string>)[readingAgainst(check.reportValue, check.reviewerSource).note]}
              {readingAgainst(check.reportValue, check.reviewerSource).discrepancy ? ` ${t.work.difference} ${readingAgainst(check.reportValue, check.reviewerSource).discrepancy}.` : ""}
              {" "}{fill(t.work.autoStatus, { status: statusText(t, check.status) })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setPicking((value) => !value)}>{t.work.wrongDoc}</Button>
            {check.reviewerSource && (
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => auditService.updateReview(sessionId, check.id, { reviewerSource: null })}>{t.work.clearChoice}</Button>
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
          <p className="text-muted-foreground">{t.work.severity}: <span className={severityMeta[check.severity].cls}>{severityText(t, check.severity)}</span></p>
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

