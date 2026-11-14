import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AwaitingProcessing } from "@/components/audit/AwaitingProcessing";
import { SelectionPanel } from "@/components/audit/SelectionPanel";
import { Workspace } from "@/components/audit/Workspace";
import { useAuditSession } from "@/hooks/useAudit";
import { useCopy } from "@/i18n/messages";

export function WorkspacePage({ id }: { id: string }) {
  const t = useCopy();
  const { session, documents, loading, error } = useAuditSession(id);

  if (loading) return <div className="p-8 text-sm text-muted-foreground">{t.work.loading}</div>;
  if (error)
    return (
      <div className="mx-auto max-w-xl p-8">
        <p className="text-sm font-medium">{t.work.openFailed}</p>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/audits">{t.work.backToAudits}</Link></Button>
      </div>
    );
  if (!session)
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">{t.work.missing}</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/audits">{t.work.backToAudits}</Link></Button>
      </div>
    );
  const report = documents.find((doc) => doc.id === session.reportDocumentId);
  if (session.processingStage === "selecting" && session.selection?.phase === "selecting" && report)
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
        <SelectionPanel session={session} report={report} copy={t} onStarted={() => undefined} />
      </div>
    );
  if (session.status === "awaiting_processing" || session.checks.length === 0)
    return <AwaitingProcessing session={session} documents={documents} />;

  return <Workspace session={session} documents={documents} />;
}
