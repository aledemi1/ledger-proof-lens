import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Check, Copy, FileSpreadsheet, FileText, Printer, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckStatusBadge, DemoBadge, ReviewerBadge, recommendationMeta } from "@/components/audit/badges";
import { AwaitingProcessing } from "@/components/audit/AwaitingProcessing";
import { useAuditSession } from "@/hooks/useAudit";
import { fill } from "@/i18n/fill";
import { recommendationText } from "@/i18n/labels";
import { useCopy } from "@/i18n/messages";
import { useLocale } from "@/i18n/use-locale";
import { buildConclusion } from "@/lib/conclusion";
import { downloadFindingsWorkbook } from "@/lib/exportFindings";
import { groupIssues } from "@/lib/findings";
import { evidencePlace, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { auditService } from "@/services/auditService";
import type { Decision, Recommendation } from "@/types/audit";

const conflicts = (d: Decision, r: Recommendation) => (d === "accept" ? r !== "accept" : r === "accept");

export function ConclusionPage({ id }: { id: string }) {
  const t = useCopy();
  const locale = useLocale();
  const { session, documents, loading, error } = useAuditSession(id);
  const [pending, setPending] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [copied, setCopied] = useState(false);

  if (loading) return <div className="p-8 text-sm text-muted-foreground">{t.conclusion.loading}</div>;
  if (error) return <div className="p-8 text-sm text-muted-foreground">{error}</div>;
  if (!session) return <div className="p-8 text-sm text-muted-foreground">{t.conclusion.missing}</div>;
  if (session.checks.length === 0) return <AwaitingProcessing session={session} documents={documents} />;

  const c = buildConclusion(session, documents, locale);
  const rec = recommendationMeta[c.recommendation];
  const openMismatches = c.findings.filter((f) => f.status === "mismatch" && f.reviewerStatus !== "verified").length;
  const openMissing = c.findings.filter((f) => f.status === "not_found" && f.reviewerStatus !== "verified").length;
  const report = documents.find((d) => d.id === session.reportDocumentId);

  const decide = async (d: Decision, comment = "") => {
    await auditService.setReviewerDecision(id, d, comment);
    setPending(null);
    setReason("");
    toast.success(d === "accept" ? t.conclusion.decisionAccept : t.conclusion.decisionRevise);
  };
  const onDecide = (d: Decision) => (conflicts(d, c.recommendation) ? setPending(d) : decide(d));

  const fullText = () => {
    const lines = [
      t.conclusion.title.toUpperCase(),
      session.title,
      "",
      c.text,
      "",
      t.conclusion.findingsHeading,
      ...c.findings.map(
        (f, i) =>
          `${i + 1}. ${f.fieldName}: ${t.conclusion.inReport} — ${f.reportValue}; ${t.conclusion.inSource} — ${f.sourceValue ?? t.conclusion.notFound}. ${f.summary}` +
          (f.evidence.length ? ` ${t.conclusion.excelSources}: ${f.evidence.map((e) => `${e.documentName}, ${evidencePlace(e)}`).join("; ")}.` : "") +
          (f.reviewerComment ? ` ${t.conclusion.reviewerComment}: ${f.reviewerComment}` : ""),
      ),
      "",
      fill(t.conclusion.systemLine, { text: recommendationText(t, c.recommendation) }),
      session.reviewerDecision ? fill(t.conclusion.reviewerLine, { text: session.reviewerDecision.decision === "accept" ? t.conclusion.decisionAccept : t.conclusion.decisionRevise }) + (session.reviewerDecision.comment ? ` ${t.conclusion.reason}: ${session.reviewerDecision.comment}` : "") : fill(t.conclusion.reviewerLine, { text: t.conclusion.none }),
    ];
    return lines.join("\n");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullText());
      setCopied(true);
      toast.success(t.conclusion.copied);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t.conclusion.copyFailed);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/audits/$id" params={{ id }}><ArrowLeft /> {t.conclusion.back}</Link>
        </Button>
        {session.isDemo && <DemoBadge className="ml-auto" />}
      </div>

      <h1 className="no-print text-2xl font-semibold tracking-tight">{t.conclusion.title}</h1>
      <p className="no-print mt-1 text-sm text-muted-foreground">{session.title}</p>

      {/* Recommendation vs decision */}
      <div className="no-print mt-5 grid gap-6 border-y border-border py-4 md:grid-cols-2">
        <div className="bg-card p-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t.conclusion.system}</div>
          <div className="mt-2 flex items-center gap-2">
            <span className={cn("size-2.5 rounded-full", rec.dot)} />
            <span className="text-base font-semibold">{t.conclusion.recommendation}: {recommendationText(t, c.recommendation)}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {c.recommendation === "revise"
              ? fill(t.conclusion.openIssues, { mismatches: openMismatches, missing: openMissing })
              : c.recommendation === "manual_review"
                ? t.conclusion.manualLeft
                : t.conclusion.clear}
          </p>
        </div>
        <div className="bg-card p-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t.conclusion.reviewer}</div>
          {session.reviewerDecision ? (
            <div className="mt-2">
              <div className="flex items-center gap-2 text-base font-semibold">
                <Check className="size-4 text-primary" /> {session.reviewerDecision.decision === "accept" ? t.conclusion.decisionAccept : t.conclusion.decisionRevise}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(session.reviewerDecision.decidedAt, true)}</p>
              {session.reviewerDecision.comment && <p className="mt-2 text-sm">{t.conclusion.reason}: {session.reviewerDecision.comment}</p>}
              <Button variant="ghost" size="sm" className="-ml-2 mt-2" onClick={() => auditService.setReviewerDecision(id, null)}>
                <Undo2 /> {t.conclusion.change}
              </Button>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted-foreground">{t.conclusion.notYet}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onDecide("accept")}>{t.conclusion.accept}</Button>
                <Button size="sm" variant="outline" onClick={() => onDecide("revise")}>{t.conclusion.revise}</Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Official document */}
      <article className="conclusion-document mt-6 border border-border bg-paper p-5 text-ink shadow-panel sm:p-8">
        <div className="no-print mb-5 flex flex-wrap justify-end gap-2 border-b border-border pb-4">
          <Button variant="outline" size="sm" onClick={copy}>{copied ? <Check /> : <Copy />} {t.conclusion.copy}</Button>
          <Button variant="outline" size="sm" onClick={() => downloadFindingsWorkbook(session.title, c, documents, locale)}><FileSpreadsheet /> {t.conclusion.excel}</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer /> {t.conclusion.print}</Button>
        </div>
        <header className="border-b border-border pb-4 text-center">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t.conclusion.brand}</div>
          <h2 className="mt-2 font-doc text-lg font-bold uppercase">{t.conclusion.title}</h2>
          <p className="mt-1 text-sm">{session.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{fill(t.conclusion.date, { date: formatDate(session.createdAt, false, locale) })}{session.isDemo ? ` · ${t.conclusion.demoMark}` : ""}</p>
        </header>

        {(session.notices?.length || session.fileErrors?.length) ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {[...(session.notices ?? []), ...(session.fileErrors?.map((file) => `«${file.fileName}»: ${file.reason}`) ?? [])].join(" ")}
          </p>
        ) : null}

        <section className="mt-5">
          <h3 className="text-sm font-semibold">{t.conclusion.s1}</h3>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-sm sm:max-w-md">
            <dt className="text-muted-foreground">{t.conclusion.report}</dt><dd className="text-right font-medium">{report?.name ?? "—"}</dd>
            <dt className="text-muted-foreground">{t.conclusion.checked}</dt><dd className="text-right tabular">{c.stats.total}</dd>
            <dt className="text-muted-foreground">{t.conclusion.confirmed}</dt><dd className="text-right tabular text-success">{c.stats.matched}</dd>
            <dt className="text-muted-foreground">{t.conclusion.mismatches}</dt><dd className="text-right tabular text-danger">{c.stats.mismatches}</dd>
            <dt className="text-muted-foreground">{t.conclusion.unconfirmed}</dt><dd className="text-right tabular text-orange">{c.stats.notFound}</dd>
            <dt className="text-muted-foreground">{t.conclusion.manual}</dt><dd className="text-right tabular text-warning">{c.stats.needsReview}</dd>
            <dt className="text-muted-foreground">{t.conclusion.unreviewed}</dt><dd className="text-right tabular">{c.stats.unreviewed}</dd>
          </dl>
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-semibold">{t.conclusion.s2}</h3>
          {c.findings.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t.conclusion.noFindings}</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr><th className="py-1 pr-3 font-medium">{t.conclusion.position}</th><th className="py-1 pr-3 font-medium">{t.conclusion.inReport}</th><th className="py-1 pr-3 font-medium">{t.conclusion.inSource}</th><th className="py-1 font-medium">{t.conclusion.status}</th></tr>
                </thead>
                <tbody>
                  {groupIssues(session.checks.filter((check) => check.status !== "match")).map((group) => (
                    <tr key={group.key} className="border-t border-border align-top">
                      <td className="py-1.5 pr-3">{group.title}{group.related.length ? ` (+${group.related.length})` : ""}</td>
                      <td className="py-1.5 pr-3 tabular">{group.primary.reportValue}</td>
                      <td className="py-1.5 pr-3 tabular">{group.primary.sourceValue ?? "—"}</td>
                      <td className="py-1.5"><CheckStatusBadge status={group.primary.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-semibold">{t.conclusion.s3}</h3>
          <p className="mt-2 text-justify font-doc text-[15px] leading-relaxed">{c.text}</p>
        </section>

        <details className="mt-6 border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-semibold">{t.conclusion.appendix}</summary>
          <ol className="mt-3 space-y-3">
            {c.findings.map((finding, index) => (
              <li key={finding.checkId} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{index + 1}. {finding.fieldName}</span>
                  <CheckStatusBadge status={finding.status} />
                  <ReviewerBadge status={finding.reviewerStatus} />
                </div>
                <p className="mt-1 text-foreground/85">{finding.summary}</p>
                {finding.evidence.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
                    {finding.evidence.map((item, evidenceIndex) => (
                      <Link key={evidenceIndex} to="/audits/$id" params={{ id }} className="inline-flex items-center gap-1 text-primary hover:underline">
                        <FileText className="size-3" /> {item.documentName}, {evidencePlace(item)}
                      </Link>
                    ))}
                  </div>
                )}
                {finding.reviewerComment && <p className="mt-1 text-xs italic">{t.conclusion.reviewerComment}: {finding.reviewerComment}</p>}
              </li>
            ))}
          </ol>
        </details>

        <section className="mt-6 grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">{t.conclusion.system}</div>
            <div className="font-medium">{rec.label}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t.conclusion.reviewer}</div>
            <div className="font-medium">{session.reviewerDecision ? (session.reviewerDecision.decision === "accept" ? t.conclusion.decisionAccept : t.conclusion.decisionRevise) : t.conclusion.notDecided}</div>
            {session.reviewerDecision?.comment && <div className="mt-0.5 text-xs">{t.conclusion.reason}: {session.reviewerDecision.comment}</div>}
          </div>
        </section>
      </article>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.conclusion.conflictTitle}</DialogTitle>
            <DialogDescription>
              {fill(t.conclusion.conflictText, { recommendation: recommendationText(t, c.recommendation), decision: pending ? (pending === "accept" ? t.conclusion.decisionAccept : t.conclusion.decisionRevise) : "" })}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.conclusion.reasonPh} className="min-h-24" autoFocus />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>{t.common.cancel}</Button>
            <Button disabled={!reason.trim()} onClick={() => pending && decide(pending, reason.trim())}>{t.conclusion.confirm}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
