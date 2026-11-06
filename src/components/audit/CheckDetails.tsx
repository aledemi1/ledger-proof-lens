import { useState } from "react";
import { CheckCircle2, FileSpreadsheet, FileText, ShieldAlert, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReviewerBadge, severityMeta } from "./badges";
import { cn } from "@/lib/utils";
import { auditService } from "@/services/auditService";
import type { CheckResult, ReviewerStatus } from "@/types/audit";

const titles = {
  mismatch: { text: "Обнаружено расхождение", cls: "text-danger" },
  not_found: { text: "Подтверждение не найдено", cls: "text-orange" },
  needs_review: { text: "Требует ручной проверки", cls: "text-warning" },
  match: { text: "Значение подтверждено", cls: "text-success" },
};

const sourceLabel = { mismatch: "В документе", not_found: "В документах", needs_review: "В документе", match: "В документе" };

export function CheckDetails({
  sessionId,
  check,
  docName,
  onShowEvidence,
  onShowReport,
}: {
  sessionId: string;
  check: CheckResult;
  docName: (id: string) => string;
  onShowEvidence: (i: number) => void;
  onShowReport?: (() => void) | undefined;
}) {
  const [comment, setComment] = useState(check.reviewerComment);
  const [expanded, setExpanded] = useState(true);
  const issue = check.status !== "match";
  const dirty = comment.trim() !== check.reviewerComment.trim();
  // Dismissing a factual mismatch / missing evidence requires an explanation.
  const needsReason = check.status === "mismatch" || check.status === "not_found";

  const update = async (reviewerStatus?: ReviewerStatus) => {
    await auditService.updateReview(sessionId, check.id, { reviewerStatus, reviewerComment: comment.trim() });
    toast.success(
      reviewerStatus === "confirmed"
        ? "Замечание подтверждено"
        : reviewerStatus === "verified"
          ? "Замечание снято"
          : reviewerStatus === "pending"
            ? "Решение отменено"
            : "Комментарий сохранён",
    );
  };

  const t = titles[check.status];

  return (
    <div className="review-details overflow-auto px-4 py-3 animate-in-up">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold">{check.fieldName}</h2>
        <Button variant="ghost" size="sm" className="h-6 text-muted-foreground" onClick={() => setExpanded((v) => !v)}>{expanded ? "Свернуть" : "Подробнее"}</Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
        <div><p className="text-xs text-muted-foreground">В отчёте</p><p className="mt-0.5 break-words font-semibold tabular">{check.reportValue}</p></div>
        <div><p className="text-xs text-muted-foreground">{sourceLabel[check.status]}</p><p className="mt-0.5 break-words font-semibold tabular">{check.sourceValue ?? "Подтверждающий документ не найден"}</p></div>
      </div>
      {check.discrepancy && <p className="mt-1 text-sm font-semibold text-danger">В отчёте на {check.discrepancy.replace(/^[+−-]/, "")} {check.discrepancy.startsWith("+") ? "больше" : "меньше"}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">Результат системы:</span><span className={cn("font-medium", t.cls)}>{t.text}</span>{issue && <span className={severityMeta[check.severity].cls}>· {severityMeta[check.severity].label}</span>}</div>

      {expanded && (
        <>
          <p className="mt-2 rounded-md bg-muted px-3 py-2 text-[13px] leading-relaxed text-foreground/85">{check.explanation}</p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {check.evidenceReferences.map((e, i) => (
              <Button key={i} variant="outline" size="sm" className="h-7 text-xs" onClick={() => onShowEvidence(i)}>
                <FileText /> {docName(e.documentId)} · стр. {e.pageNumber}
              </Button>
            ))}
            {onShowReport && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onShowReport}>
                <FileSpreadsheet /> Показать в отчёте
              </Button>
            )}
          </div>
        </>
      )}

      {issue && (
        <div className="review-actions mt-3 space-y-2 border-t border-border pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-medium">Решение сотрудника</span><ReviewerBadge status={check.reviewerStatus} /></div>
          {needsReason && <p className="text-xs text-muted-foreground">Для снятия укажите причину</p>}
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий проверяющего"
            className="min-h-10 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={check.reviewerStatus === "confirmed" ? "destructive" : "outline"} onClick={() => update("confirmed")}>
              <ShieldAlert /> Подтвердить замечание
            </Button>
            <Button
              size="sm"
              variant={check.reviewerStatus === "verified" ? "default" : "outline"}
              disabled={needsReason && !comment.trim()}
              title={needsReason && !comment.trim() ? "Укажите в комментарии, почему замечание снимается" : undefined}
              onClick={() => update("verified")}
            >
              <CheckCircle2 /> Снять замечание
            </Button>
            {check.reviewerStatus !== "pending" && (
              <Button size="sm" variant="ghost" onClick={() => update("pending")}>
                <Undo2 /> Отменить решение
              </Button>
            )}
            {dirty && (
              <Button size="sm" variant="ghost" className="ml-auto text-primary" onClick={() => update()}>
                Сохранить комментарий
              </Button>
            )}
          </div>
          {check.reviewerStatus === "verified" && check.status !== "needs_review" && (
            <p className="text-[11px] text-muted-foreground">
              Исходный результат автоматической проверки («{check.status === "mismatch" ? "Расхождение" : "Не найдено подтверждение"}») сохранён и будет указан в заключении.
            </p>
          )}
        </div>
      )}
      {!issue && (
        <div className="mt-2 flex gap-2">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий (необязательно)" className="min-h-9 text-sm" />
          {dirty && <Button size="sm" variant="outline" onClick={() => update()}>Сохранить</Button>}
        </div>
      )}
    </div>
  );
}
