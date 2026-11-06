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
          ? "Отмечено как проверенное"
          : reviewerStatus === "pending"
            ? "Решение отменено"
            : "Комментарий сохранён",
    );
  };

  const t = titles[check.status];

  return (
    <div className="max-h-[42vh] overflow-auto px-4 py-3 animate-in-up lg:px-6">
      <div className="flex items-center gap-2">
        <h2 className={cn("text-sm font-semibold", t.cls)}>{t.text}</h2>
        {issue && <span className={cn("text-xs", severityMeta[check.severity].cls)}>· {severityMeta[check.severity].label}</span>}
        <div className="ml-auto flex items-center gap-2">
          {issue && <ReviewerBadge status={check.reviewerStatus} />}
          <button onClick={() => setExpanded((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">
            {expanded ? "Свернуть" : "Подробнее"}
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr_auto_1fr_auto_1fr]">
        <Kv k="Показатель" v={check.fieldName} className="col-span-2 sm:col-span-6" />
        <Kv k="В отчёте" v={check.reportValue} />
        <Kv k={sourceLabel[check.status]} v={check.sourceValue ?? "не найдено"} muted={!check.sourceValue} />
        {check.discrepancy && <Kv k="Разница" v={check.discrepancy} strong />}
      </div>

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
        <div className="mt-3 space-y-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={needsReason ? "Комментарий проверяющего (обязателен, чтобы снять замечание)" : "Комментарий проверяющего"}
            className="min-h-14 text-sm"
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
              <CheckCircle2 /> Отметить как проверенное
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

function Kv({ k, v, strong, muted, className }: { k: string; v: string; strong?: boolean; muted?: boolean; className?: string }) {
  return (
    <div className={cn("contents", className)}>
      <span className={cn("text-xs text-muted-foreground sm:self-center", className && "hidden")}>{k}</span>
      <span className={cn("tabular", strong && "font-semibold text-danger", muted && "italic text-muted-foreground", className)}>
        {className ? <><span className="mr-2 text-xs text-muted-foreground">{k}:</span><b className="font-medium">{v}</b></> : v}
      </span>
    </div>
  );
}
