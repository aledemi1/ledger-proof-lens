import { useState } from "react";
import { CheckCircle2, MessageSquare, ShieldAlert, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReviewerBadge } from "./badges";
import { useCopy } from "@/i18n/messages";
import { auditService } from "@/services/auditService";
import type { CheckResult, ReviewerStatus } from "@/types/audit";

/**
 * Always-visible reviewer actions for the selected check. The reviewer verdict is
 * stored separately from the automatic status, which this bar never changes.
 */
export function ReviewBar({ sessionId, check }: { sessionId: string; check: CheckResult }) {
  const t = useCopy();
  const [comment, setComment] = useState(check.reviewerComment);
  const [mode, setMode] = useState<"none" | "dismiss" | "comment">("none");
  const issue = check.status !== "match";

  const update = async (reviewerStatus?: ReviewerStatus) => {
    await auditService.updateReview(sessionId, check.id, { reviewerStatus, reviewerComment: comment.trim() });
    setMode("none");
    toast.success(
      reviewerStatus === "confirmed" ? t.work.issueConfirmed : reviewerStatus === "verified" ? t.work.issueDismissed : reviewerStatus === "pending" ? t.work.decisionUndone : t.work.commentSaved,
    );
  };

  return (
    <div className="review-actions border-t border-border bg-card px-3 py-2 shadow-[0_-4px_12px_-8px_rgb(0_0_0/0.15)]">
      {mode !== "none" && (
        <div className="mb-2 space-y-1.5">
          <p className="text-xs font-medium">{mode === "dismiss" ? t.work.commentRequired : t.work.comment}</p>
          <Textarea autoFocus value={comment} onChange={(e) => setComment(e.target.value)} placeholder={mode === "dismiss" ? t.work.whyDismiss : t.work.commentPh} className="min-h-14 text-sm" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setMode("none"); setComment(check.reviewerComment); }}>{t.common.cancel}</Button>
            {mode === "dismiss" ? (
              <Button size="sm" disabled={!comment.trim()} onClick={() => update("verified")}><CheckCircle2 /> {t.work.dismiss}</Button>
            ) : (
              <Button size="sm" onClick={() => update()}>{t.common.save}</Button>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 truncate text-xs font-medium">{check.fieldName}</span>
        {issue && <ReviewerBadge status={check.reviewerStatus} />}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setMode(mode === "comment" ? "none" : "comment")}>
            <MessageSquare /> <span className="hidden sm:inline">{check.reviewerComment ? t.work.commentMark : t.work.commentPh}</span>
          </Button>
          {issue && check.reviewerStatus !== "pending" && (
            <Button size="sm" variant="ghost" onClick={() => update("pending")}><Undo2 /> <span className="hidden sm:inline">{t.work.undo}</span></Button>
          )}
          {issue && (
            <>
              <Button size="sm" variant={check.reviewerStatus === "verified" ? "default" : "outline"} onClick={() => setMode("dismiss")}>
                <CheckCircle2 /> {t.work.dismiss}
              </Button>
              <Button size="sm" variant={check.reviewerStatus === "confirmed" ? "destructive" : "default"} onClick={() => update("confirmed")}>
                <ShieldAlert /> {t.work.confirmIssue}
              </Button>
            </>
          )}
        </div>
      </div>
      {check.reviewerStatus === "verified" && check.status !== "needs_review" && (
        <p className="mt-1 text-[11px] text-muted-foreground">{t.work.autoKept}</p>
      )}
    </div>
  );
}
