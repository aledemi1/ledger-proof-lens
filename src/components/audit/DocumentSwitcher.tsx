import { ChevronDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { checkStatusMeta } from "./badges";
import { docTypeLabel } from "@/lib/documentTypes";
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
}: {
  documents: AuditDocument[];
  activeId: string | null;
  onSelect: (id: string) => void;
  counts: Map<string, Record<CheckStatus, number>>;
  sourceIds: Set<string>;
  page?: number | undefined;
}) {
  const active = documents.find((d) => d.id === activeId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 min-w-0 flex-1 justify-start gap-2 px-2" aria-label="Выбрать документ">
          <FileText className="shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{active?.name ?? "Документ не выбран"}</span>
          {page ? <span className="shrink-0 text-xs text-muted-foreground">· стр. {page}</span> : null}
          <span className="shrink-0 text-xs text-muted-foreground">{documents.length > 1 ? `· ещё ${documents.length - 1}` : ""}</span>
          <ChevronDown className="ml-auto shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Первичные документы</DropdownMenuLabel>
        {documents.map((doc) => {
          const c = counts.get(doc.id);
          return (
            <DropdownMenuItem key={doc.id} onSelect={() => onSelect(doc.id)} className={cn("flex-col items-start gap-0.5", doc.id === activeId && "bg-accent")}>
              <span className="flex w-full items-center gap-2 text-sm">
                <span className="truncate">{doc.name}</span>
                {sourceIds.has(doc.id) && <span className="ml-auto shrink-0 rounded bg-primary px-1 text-[9px] font-semibold uppercase text-primary-foreground">источник</span>}
              </span>
              <span className="flex w-full items-center gap-2 text-[11px] text-muted-foreground">
                {docTypeLabel[doc.type]}
                <span className="ml-auto flex gap-1.5">
                  {statusOrder.map((s) => c?.[s] ? <span key={s} className="flex items-center gap-0.5"><span className={cn("size-1.5 rounded-full", checkStatusMeta[s].dot)} />{c[s]}</span> : null)}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
        {documents.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">В проекте нет первичных документов.</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
