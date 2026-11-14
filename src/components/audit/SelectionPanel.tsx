import { useRef, useState } from "react";
import { Check, Sparkles, Trash2 } from "lucide-react";
import { DocumentViewer } from "@/components/audit/DocumentViewer";
import { WaitTime } from "@/components/audit/WaitTime";
import type { PickCell } from "@/components/audit/RealDocument";
import { Button } from "@/components/ui/button";
import { auditService } from "@/services/auditService";
import type { AuditDocument, AuditSession, ChosenCell } from "@/types/audit";
import type { Copy } from "@/i18n/copy";

function samePick(left: ChosenCell[], right: ChosenCell[]): ChosenCell[] {
  const seen = new Set(left.map((item) => item.anchor));
  return [...left, ...right.filter((item) => !seen.has(item.anchor))];
}

/** Lets the person mark report values on the preview before the reconciliation starts. */
export function SelectionPanel({
  session,
  report,
  copy,
  onStarted,
}: {
  session: AuditSession;
  report: AuditDocument;
  copy: Copy;
  onStarted: () => void;
}) {
  const [picked, setPicked] = useState<ChosenCell[]>([]);
  const [busy, setBusy] = useState<"auto" | "start" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dragBase = useRef<ChosenCell[] | null>(null);
  const toggle = (cell: PickCell) => setPicked((current) => current.some((item) => item.anchor === cell.anchor)
    ? current.filter((item) => item.anchor !== cell.anchor)
    : [...current, cell]);
  const onCells = (cells: PickCell[], drag: boolean | "start") => {
    setError(null);
    if (drag === "start") {
      setPicked((current) => {
        dragBase.current = current;
        return current;
      });
      return;
    }
    if (drag) {
      setPicked(samePick(dragBase.current ?? [], cells));
      return;
    }
    dragBase.current = null;
    const cell = cells[0];
    if (cell) toggle(cell);
  };
  const marks = picked.map((item) => ({
    checkId: item.anchor,
    anchor: item.anchor,
    page: 1,
    status: "match" as const,
  }));
  const run = async (kind: "auto" | "start") => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "auto") {
        const items = await auditService.suggestIndicators(session.id);
        setPicked(items);
        if (!items.length) setError(copy.neu.chooseNone);
      } else {
        await auditService.startSelection(session.id, picked);
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
        <DocumentViewer doc={report} marks={marks} focus={null} onCells={onCells} />
      </div>
      <aside className="flex min-h-0 flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">{copy.neu.chooseTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.neu.chooseLead}</p>
          <WaitTime seconds={session.estimateSeconds} next />
        </div>
        <div className="flex flex-col gap-2">
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void run("auto")}>
            <Sparkles className="h-4 w-4" /> {busy === "auto" ? copy.neu.choosing : copy.neu.chooseAuto}
          </Button>
          <Button type="button" disabled={busy !== null || picked.length === 0} onClick={() => void run("start")}>
            <Check className="h-4 w-4" /> {busy === "start" ? copy.neu.starting : copy.neu.startCheck}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {picked.map((item) => (
            <li key={item.anchor} className="flex items-start gap-2 rounded-md border border-border bg-card p-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.name}</span>
                {item.name !== item.value && <span className="font-mono text-xs">{item.value}</span>}
              </span>
              <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => toggle(item)} aria-label={copy.neu.removeValue}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {picked.length === 0 && <li className="text-sm text-muted-foreground">{copy.neu.chooseEmpty}</li>}
        </ul>
      </aside>
    </div>
  );
}
