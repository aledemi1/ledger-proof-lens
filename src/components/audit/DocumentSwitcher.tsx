import { ChevronDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { checkStatusMeta } from "./badges";
import { fill } from "@/i18n/fill";
import { docText } from "@/i18n/labels";
import { useCopy } from "@/i18n/messages";
import { statusOrder } from "@/lib/marks";
import { cn } from "@/lib/utils";
import type { AuditDocument, CheckStatus } from "@/types/audit";

/** Compact picker: current file name, page, and a dropdown with the other documents. */
export function DocumentSwitcher({
  documents,
  activeId,
  onSelect,
  counts,
  sourceIds,
  page,
  duplicates,
}: {
  documents: AuditDocument[];
  activeId: string | null;
  onSelect: (id: string) => void;
  counts: Map<string, Record<CheckStatus, number>>;
  sourceIds: Set<string>;
  page?: number | undefined;
  duplicates?: Set<string>;
}) {
  const t = useCopy();
  const active = documents.find((d) => d.id === activeId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 min-w-0 flex-1 justify-start gap-2 px-2" aria-label={t.work.pickDocument}>
          <FileText className="shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{active?.name ?? t.work.noDocument}</span>
          {active && duplicates?.has(active.name) ? <span className="shrink-0 rounded bg-warning-soft px-1 text-[10px] font-semibold text-warning" title={t.work.copyTitle}>{t.work.copy}</span> : null}
          {page ? <span className="shrink-0 text-xs text-muted-foreground">· {fill(t.work.page, { n: page })}</span> : null}
          <span className="shrink-0 text-xs text-muted-foreground">{documents.length > 1 ? `· ${fill(t.work.moreFiles, { n: documents.length - 1 })}` : ""}</span>
          <ChevronDown className="ml-auto shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t.neu.documents}</DropdownMenuLabel>
        {documents.map((doc) => {
          const c = counts.get(doc.id);
          return (
            <DropdownMenuItem key={doc.id} onSelect={() => onSelect(doc.id)} className={cn("flex-col items-start gap-0.5", doc.id === activeId && "bg-accent")}>
              <span className="flex w-full items-center gap-2 text-sm">
                <span className="truncate">{doc.name}</span>
                {duplicates?.has(doc.name) ? <span className="shrink-0 rounded bg-warning-soft px-1 text-[10px] font-semibold text-warning">{t.work.copy}</span> : null}
                {sourceIds.has(doc.id) && <span className="ml-auto shrink-0 rounded bg-primary px-1 text-[9px] font-semibold uppercase text-primary-foreground">{t.work.sourceBadge}</span>}
              </span>
              <span className="flex w-full items-center gap-2 text-[11px] text-muted-foreground">
                {doc.type !== "unknown" && docText(t, doc.type)}
                <span className="ml-auto flex gap-1.5">
                  {statusOrder.map((s) => c?.[s] ? <span key={s} className="flex items-center gap-0.5"><span className={cn("size-1.5 rounded-full", checkStatusMeta[s].dot)} />{c[s]}</span> : null)}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
        {documents.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">{t.work.noPrimary}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
