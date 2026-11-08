import { Link } from "@tanstack/react-router";
import { ArrowRight, FileText, GitCompareArrows, ClipboardCheck, ArrowUpRight, Check, CircleAlert, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkProvider, SyntheticPage } from "@/components/audit/SyntheticDocument";
import { checkStatusMeta } from "@/components/audit/badges";
import { useAuditSession } from "@/hooks/useAudit";
import { evidencePlace } from "@/lib/format";
import { DEMO_SESSION_ID } from "@/mocks/demoAudit";
import { LandingSections } from "@/components/landing/LandingSections";

export function LandingPage() {
  const { session, documents } = useAuditSession(DEMO_SESSION_ID);
  const check = session?.checks.find((c) => c.fieldName === "Стоимость поставки") ?? session?.checks.find((c) => c.status === "mismatch");
  const evidence = check?.evidenceReferences[0];
  const doc = documents.find((d) => d.id === evidence?.documentId);
  const page = doc?.preview.kind === "synthetic" ? doc.preview.pages[(evidence?.pageNumber ?? 1) - 1] : undefined;
  const fragment = page ? { blocks: page.blocks.filter((b) => b.kind === "title" || b.kind === "meta" || b.kind === "fields").map((b) => b.kind === "fields" ? { ...b, rows: b.rows.filter((r) => r.label === check?.fieldName) } : b) } : undefined;
  const report = documents.find((d) => d.id === session?.reportDocumentId);
  const previewChecks = check ? [check, ...(session?.checks.filter((c) => c.status === "match").slice(0, 2) ?? [])] : [];
  return (
    <div className="mx-auto max-w-6xl px-5 pb-8 lg:px-8">
      <section className="mx-auto max-w-3xl py-7 text-center sm:py-8">
        <p className="mb-3 flex items-center justify-center gap-2 text-sm font-medium text-primary"><GitCompareArrows className="size-4" /> От показателя — к первоисточнику</p>
        <h1 className="text-3xl font-semibold leading-tight sm:text-[40px]">Сверка отчётности.<br /><span className="text-muted-foreground">Каждый вывод — с подтверждением.</span></h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">Sverko сопоставляет отчёт с актами, счетами и накладными. Расхождения, подтверждающие фрагменты и решение проверяющего — в одном рабочем пространстве.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="px-5"><Link to="/audits/$id" params={{ id: DEMO_SESSION_ID }}>Открыть демо-проверку <ArrowRight /></Link></Button>
          <Button asChild size="lg" variant="outline" className="bg-card px-5"><Link to="/new">Новая проверка</Link></Button>
        </div>
      </section>
      <section aria-label="Пример сверки" className="overflow-hidden rounded-lg border border-border bg-card shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2 text-sm font-semibold"><GitCompareArrows className="size-4 text-primary" /> Отчёт и первичные документы</div>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-warning" />Демонстрационные данные</span>
        </div>
        <div className="grid md:grid-cols-[1.1fr_1fr]">
          <div className="min-w-0 border-b border-border md:border-r md:border-b-0">
            <div className="flex items-center gap-2 px-4 py-4 sm:px-5"><FileText className="size-4 shrink-0 text-success" /><span className="truncate text-sm text-muted-foreground">{report?.name ?? "Отчёт"}</span></div>
            <div className="grid grid-cols-[1fr_110px] border-y border-border bg-muted/50 px-4 py-2 text-xs text-muted-foreground sm:px-5"><span>Показатель</span><span className="text-right">В отчёте</span></div>
            {!session && <div className="p-5 text-sm text-muted-foreground">Загрузка примера сверки…</div>}
            {previewChecks.map((row) => <div key={row.id} className={`grid grid-cols-[minmax(0,1fr)_110px] items-center gap-3 border-b border-border px-4 py-3 text-sm sm:px-5 ${row.id === check?.id ? "bg-danger-soft" : ""}`}><span className="flex min-w-0 items-center gap-2">{row.status === "match" ? <Check className="size-4 shrink-0 text-success" /> : <CircleAlert className="size-4 shrink-0 text-danger" />}<span>{row.fieldName}</span></span><span className={`break-all text-right font-medium tabular ${row.id === check?.id ? "text-danger" : ""}`}>{row.reportValue}</span></div>)}
            <div className="px-4 py-3 sm:px-5"><Button asChild variant="link" className="h-auto p-0 text-sm"><Link to="/audits/$id" params={{ id: DEMO_SESSION_ID }}>Все результаты сверки <ArrowUpRight className="size-4" /></Link></Button></div>
          </div>
          <div className="min-w-0 bg-muted/30 p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2 text-xs font-medium text-primary"><Link2 className="size-4" /> Подтверждающий источник</div>
            {check && <div className="mb-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">{check.fieldName}</h2><span className="flex items-center gap-1 text-xs font-medium text-danger"><CircleAlert className="size-3.5" />{checkStatusMeta[check.status].label}</span></div><div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="text-sm text-muted-foreground">В документе</span><span className="text-xl font-semibold tabular">{check.sourceValue}</span>{check.discrepancy && <span className="text-sm font-medium text-danger">Разница {check.discrepancy}</span>}</div></div>}
            {fragment && <div className="landing-document"><MarkProvider active={evidence?.locationInDocument} linked={new Set()}><SyntheticPage page={fragment} pageNumber={evidence?.pageNumber ?? 1} pageCount={doc?.pageCount ?? 1} /></MarkProvider></div>}
            {!fragment && evidence && <div className="rounded-sm border border-border bg-paper p-5 text-ink shadow-paper"><p className="text-xs font-medium text-muted-foreground">Фрагмент источника</p><blockquote className="my-5 break-words font-doc text-lg leading-relaxed"><mark data-anchor={evidence.locationInDocument} className="rounded-sm bg-highlight px-1 text-ink">{evidence.sourceText}</mark></blockquote><div className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground"><FileText className="size-3.5 shrink-0" /><span className="min-w-0 break-all">{doc?.name} · {evidencePlace(evidence)}</span></div></div>}
          </div>
        </div>
      </section>
      <section className="mt-7 border-b border-border pb-7"><div className="grid gap-5 sm:grid-cols-3">{[{ Icon: FileText, title: "01 / Соберите документы", text: "Отчёт, акты, накладные и счета в одной проверке." }, { Icon: GitCompareArrows, title: "02 / Проверьте расхождения", text: "От значения в отчёте к подтверждающему фрагменту." }, { Icon: ClipboardCheck, title: "03 / Примите решение", text: "Замечания, комментарии и источники в заключении." }].map(({ Icon, title, text }) => <div key={title} className="flex gap-3"><Icon className="mt-1 size-5 shrink-0 text-primary" /><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p></div></div>)}</div></section>
      <LandingSections />
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5 text-xs text-muted-foreground"><span>Sverko · Проверка отчётности</span><span>Выводы системы. Решение человека.</span></footer>
    </div>
  );
}
