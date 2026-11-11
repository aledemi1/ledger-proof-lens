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

function previewFragments(doc: AuditDocument, labels: { paragraph: string; table: string; sheet: (name: string, cell: string) => string }): { anchor: string; text: string; label: string }[] {
  if (doc.preview.kind === "grid") {
    return doc.preview.sheets.flatMap((sheet) => sheet.rows.flatMap((row) => row.cells.filter((cell) => cell.text.trim()).map((cell) => ({
      anchor: cell.anchor,
      text: cell.text,
      label: labels.sheet(sheet.name, cell.address),
    }))));
  }
  if (doc.preview.kind === "flow") {
    return doc.preview.blocks.flatMap((block) => {
      if (block.kind === "paragraph" && block.anchor && block.text?.trim()) return [{ anchor: block.anchor, text: block.text, label: labels.paragraph }];
      if (block.kind === "table" && block.rows) {
        return block.rows.flatMap((row) => row.cells.filter((cell) => cell.text.trim()).map((cell) => ({ anchor: cell.anchor, text: cell.text, label: labels.table })));
      }
      return [];
    });
  }
  return [];
}

export function FragmentPicker({
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
  const t = useCopy();
  const fragments = doc ? previewFragments(doc, { paragraph: t.work.paragraph, table: t.work.table, sheet: (name, cell) => fill(t.work.sheet, { name, cell }) }) : [];
  const shown = fragments.filter((fragment) => `${fragment.label} ${fragment.text}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 40);
  if (!doc) return <p className="text-muted-foreground">{t.work.openSourceFirst}</p>;
  if (!fragments.length) return <p className="text-muted-foreground">{t.work.noRows}</p>;
  return (
    <div className="rounded-md border border-border p-2">
      <Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder={t.work.findFragment} className="h-7 text-xs" />
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
