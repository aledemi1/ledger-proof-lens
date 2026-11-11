import { fill } from "@/i18n/fill";
import type { Copy } from "@/i18n/copy";
import type { AuditNotice } from "@/types/audit";

export { parseNotice, parseNotices } from "./notice-codes";

export function formatNotice(notice: AuditNotice, t: Copy): string {
  switch (notice.code) {
    case "duplicate_file":
      return fill(t.notices.duplicateFile, { name: notice.name });
    case "partial_read":
      return t.notices.partialRead;
    case "model_two_stage":
      return t.notices.modelTwoStage;
    case "model_failed":
      return fill(t.notices.modelFailed, { reason: notice.reason });
    case "labels_failed":
      return fill(t.notices.labelsFailed, { reason: notice.reason });
    case "context_truncated":
      return fill(t.notices.contextTruncated, { kept: notice.kept, limit: notice.limit });
    case "legacy":
      return notice.text;
  }
}

export function duplicateFileNames(notices: AuditNotice[] | undefined): string[] {
  return (notices ?? []).flatMap((notice) => (notice.code === "duplicate_file" ? [notice.name] : []));
}
