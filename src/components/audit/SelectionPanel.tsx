import { useState } from "react";
import { Check, Sparkles, Trash2 } from "lucide-react";
import { DocumentViewer } from "@/components/audit/DocumentViewer";
import { WaitTime } from "@/components/audit/WaitTime";
import { Button } from "@/components/ui/button";
import { auditService } from "@/services/auditService";
import type { AuditDocument, AuditSession, ReportRegion } from "@/types/audit";
import type { Copy } from "@/i18n/copy";

/** Lets the person mark report values on the preview before the reconciliation starts. */
export function SelectionPanel({
  session,
  report,
  regions,
  copy,
  onStarted,
}: {
  session: AuditSession;
  report: AuditDocument;
  regions: ReportRegion[];
  copy: Copy;
  onStarted: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<"auto" | "start" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const marks = regions.map((region) => ({
    checkId: region.id,
    anchor: region.anchor,
    page: region.pageNumber,
    status: selected.includes(region.id) ? "match" as const : "needs_review" as const,
    ...(region.box ? { box: region.box } : {}),
  }));
  const run = async (kind: "auto" | "start") => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "auto") {
        const ids = await auditService.suggestIndicators(session.id);
        setSelected(ids.filter((id) => regions.some((region) => region.id === id)));
      } else {
        await auditService.startSelection(session.id, regions.length ? selected : []);
        onStarted();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.neu.selectionFailed);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="h-[72vh] overflow-hidden rounded-md border border-border bg-paper">
        <DocumentViewer
          doc={report}
          marks={marks}
          focus={null}
          onMarkClick={(mark) => {
            if (mark.checkId) toggle(mark.checkId);
          }}
        />
      </div>
      <aside className="flex min-h-0 flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">{copy.neu.chooseTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{regions.length ? copy.neu.chooseLead : copy.neu.noValues}</p>
          <WaitTime seconds={session.estimateSeconds} next />
        </div>
        <div className="flex flex-col gap-2">
          {regions.length > 0 && (
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void run("auto")}>
              <Sparkles className="h-4 w-4" /> {busy === "auto" ? copy.neu.choosing : copy.neu.chooseAuto}
            </Button>
          )}
          <Button type="button" disabled={busy !== null || (regions.length > 0 && selected.length === 0)} onClick={() => void run("start")}>
            <Check className="h-4 w-4" /> {busy === "start" ? copy.neu.starting : copy.neu.startCheck}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {selected.map((id) => {
            const region = regions.find((item) => item.id === id);
            if (!region) return null;
            return (
              <li key={id} className="flex items-start gap-2 rounded-md border border-border bg-card p-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{region.name}</span>
                  <span className="font-mono text-xs">{region.value}</span>
                </span>
                <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => toggle(id)} aria-label={copy.neu.removeValue}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
          {regions.length > 0 && selected.length === 0 && <li className="text-sm text-muted-foreground">{copy.neu.chooseEmpty}</li>}
        </ul>
      </aside>
    </div>
  );
}
