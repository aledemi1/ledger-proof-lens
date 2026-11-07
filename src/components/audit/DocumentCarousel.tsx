import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, FileImage, FileSpreadsheet, FileText, FileX2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkStatusMeta } from "./badges";
import { docTypeLabel } from "@/lib/documentTypes";
import { statusOrder } from "@/lib/marks";
import { cn } from "@/lib/utils";
import type { AuditDocument, CheckStatus } from "@/types/audit";

function DocIcon({ doc }: { doc: AuditDocument }) {
  const kind = doc.preview.kind;
  const Icon = kind === "none" ? FileX2 : kind === "image" ? FileImage : kind === "grid" ? FileSpreadsheet : FileText;
  return <Icon className="size-4" />;
}

export function DocumentCarousel({
  documents,
  activeId,
  onSelect,
  counts,
  sourceIds,
}: {
  documents: AuditDocument[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Checks per category that cite each document. */
  counts: Map<string, Record<CheckStatus, number>>;
  /** Documents cited by the selected check. */
  sourceIds: Set<string>;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const index = documents.findIndex((doc) => doc.id === activeId);

  useEffect(() => {
    if (!activeId) return;
    rowRef.current?.querySelector<HTMLElement>(`[data-doc="${CSS.escape(activeId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeId]);

  const step = (dir: -1 | 1) => {
    if (!documents.length) return;
    const next = documents[(Math.max(index, 0) + dir + documents.length) % documents.length];
    if (next) onSelect(next.id);
  };

  return (
    <div className="flex items-stretch gap-1 border-b border-border bg-card px-2 py-2">
      <Button variant="ghost" size="icon" className="h-auto w-7 shrink-0" onClick={() => step(-1)} disabled={documents.length < 2} aria-label="Предыдущий документ">
        <ChevronLeft />
      </Button>
      <div ref={rowRef} className="doc-carousel flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 pt-1.5" role="tablist" aria-label="Первичные документы проекта">
        {documents.map((doc, i) => {
          const active = doc.id === activeId;
          const docCounts = counts.get(doc.id);
          return (
            <button
              key={doc.id}
              data-doc={doc.id}
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(doc.id)}
              className={cn(
                "relative flex w-48 shrink-0 flex-col gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors",
                active ? "border-primary bg-primary-soft shadow-panel" : "border-border bg-background hover:border-primary/40 hover:bg-accent/50",
              )}
            >
              <div className="flex items-start gap-2">
                <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  <DocIcon doc={doc} />
                </span>
                <span className="line-clamp-2 min-w-0 text-xs font-medium leading-snug" title={doc.name}>{doc.name}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span>{i + 1}/{documents.length}</span>
                <span>· {docTypeLabel[doc.type]}</span>
                <span className="ml-auto flex items-center gap-1">
                  {statusOrder.map((status) =>
                    docCounts?.[status] ? (
                      <span key={status} className="flex items-center gap-0.5" title={checkStatusMeta[status].label}>
                        <span className={cn("size-1.5 rounded-full", checkStatusMeta[status].dot)} />
                        <span className="tabular">{docCounts[status]}</span>
                      </span>
                    ) : null,
                  )}
                </span>
              </div>
              {sourceIds.has(doc.id) && !active && (
                <span className="absolute -top-1.5 right-2 rounded bg-primary px-1 text-[9px] font-semibold uppercase tracking-wide text-primary-foreground">источник</span>
              )}
            </button>
          );
        })}
        {documents.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">В проекте нет первичных документов.</p>}
      </div>
      <Button variant="ghost" size="icon" className="h-auto w-7 shrink-0" onClick={() => step(1)} disabled={documents.length < 2} aria-label="Следующий документ">
        <ChevronRight />
      </Button>
    </div>
  );
}
