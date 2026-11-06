import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileText, ServerOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoBadge, SessionStatusBadge } from "./badges";
import { docTypeLabel } from "@/lib/documentTypes";
import { fileExt, formatDate, formatSize } from "@/lib/format";
import { auditService } from "@/services/auditService";
import type { AuditDocument, AuditSession } from "@/types/audit";

export function AwaitingProcessing({ session, documents }: { session: AuditSession; documents: AuditDocument[] }) {
  const navigate = useNavigate();
  const report = documents.find((d) => d.id === session.reportDocumentId);
  const supporting = documents.filter((d) => d.id !== session.reportDocumentId);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
        <Link to="/audits"><ArrowLeft /> Все проверки</Link>
      </Button>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{session.title}</h1>
        <SessionStatusBadge status={session.status} />
        {session.isDemo && <DemoBadge />}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Создана {formatDate(session.createdAt, true)}</p>
      {session.description && <p className="mt-3 text-sm">{session.description}</p>}

      <div className="mt-6 flex gap-3 rounded-lg border border-border bg-card p-4 shadow-panel">
        <ServerOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="text-sm">
          <p className="font-medium">Ожидает подключения обработки документов</p>
          <p className="mt-1 text-muted-foreground">
            Сопоставление показателей выполняется на сервере, который пока не подключён. Файлы никуда не отправлялись,
            их содержимое не сохранялось — в черновике хранятся только названия и размеры. Результаты появятся здесь после
            подключения серверной обработки.
          </p>
        </div>
      </div>

      <h2 className="mt-8 text-sm font-semibold">Состав документов</h2>
      <div className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {[report, ...supporting].filter(Boolean).map((d) => (
          <div key={d!.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <FileText className="size-4 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{d!.name}</span>
            <span className="text-xs text-muted-foreground">{d === report ? "Основной отчёт" : docTypeLabel[d!.type]}</span>
            <span className="w-14 text-right text-xs uppercase text-muted-foreground">{fileExt(d!.name)}</span>
            <span className="w-16 text-right text-xs text-muted-foreground tabular">{formatSize(d!.size)}</span>
          </div>
        ))}
      </div>

      {!session.isDemo && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-6 text-danger hover:text-danger"
          onClick={async () => {
            await auditService.deleteDraft(session.id);
            navigate({ to: "/audits" });
          }}
        >
          <Trash2 /> Удалить черновик
        </Button>
      )}
    </div>
  );
}
