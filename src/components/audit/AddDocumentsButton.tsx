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

export function AddDocumentsButton({ sessionId, demo }: { sessionId: string; demo: boolean }) {
  const t = useCopy();
  const input = useRef<HTMLInputElement>(null);
  const add = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (input.current) input.current.value = "";
    if (!files.length) return;
    const accepted = files.filter((file) => SUPPORTING_EXTENSIONS.includes(file.name.split(".").pop()?.toLowerCase() ?? ""));
    if (accepted.length !== files.length) toast.error(t.work.skipped);
    if (!accepted.length) return;
    if (demo) {
      toast.message(t.work.demoLocked);
      return;
    }
    try {
      await auditService.addDocuments(sessionId, accepted);
      toast.success(accepted.length === 1 ? t.work.addedOne : t.work.addedMany);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : t.work.addFailed);
    }
  };
  return (
    <>
      <input ref={input} type="file" className="hidden" multiple accept={SUPPORTING_EXTENSIONS.map((ext) => `.${ext}`).join(",")} onChange={(event) => void add(event.target.files)} />
      <Button variant="outline" size="icon" className="size-8 shrink-0" aria-label={t.work.add} title={t.work.add} onClick={() => {
        if (demo) {
          toast.message(t.work.demoLocked);
          return;
        }
        input.current?.click();
      }}>
        <Plus />
      </Button>
    </>
  );
}
