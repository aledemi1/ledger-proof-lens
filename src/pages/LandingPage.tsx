import { Link } from "@tanstack/react-router";
import { ArrowRight, FileText, GitCompareArrows, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkProvider, SyntheticPage } from "@/components/audit/SyntheticDocument";
import { useAuditSession } from "@/hooks/useAudit";
import { DEMO_SESSION_ID } from "@/mocks/demoAudit";

export function LandingPage() {
  const { session, documents } = useAuditSession(DEMO_SESSION_ID);
  const check = session?.checks.find((c) => c.fieldName === "Стоимость оборудования");
  const evidence = check?.evidenceReferences[0];
  const doc = documents.find((d) => d.id === evidence?.documentId);
  const page = doc?.preview.kind === "synthetic" ? doc.preview.pages[(evidence?.pageNumber ?? 1) - 1] : undefined;
  const fragment = page ? { blocks: page.blocks.filter((b) => b.kind === "title" || b.kind === "meta" || b.kind === "fields").map((b) => b.kind === "fields" ? { ...b, rows: b.rows.filter((r) => r.label === check?.fieldName) } : b) } : undefined;
  return (
    <div className="mx-auto max-w-6xl px-5 pb-10 lg:px-8">
      <section className="grid items-center gap-10 py-10 md:grid-cols-[1fr_1.08fr] lg:gap-14 lg:py-14">
        <div>
          <h1 className="max-w-lg text-3xl font-semibold leading-tight sm:text-4xl">Сверка отчётности по первичным документам</h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">Сравните суммы и количества из отчёта с актами и накладными. Откройте строку документа, чтобы проверить расхождение.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg" className="px-5"><Link to="/audits/$id" params={{ id: DEMO_SESSION_ID }}>Открыть демо-проверку <ArrowRight /></Link></Button>
            <Button asChild size="lg" variant="outline" className="px-5"><Link to="/new">Новая проверка</Link></Button>
          </div>
        </div>
        <div className="min-w-0">
          {check && <><div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">{check.fieldName}</h2><span className="text-xs font-medium text-danger">Расхождение</span></div>
          <div className="mt-4 grid grid-cols-2 gap-4 border-y border-border py-4"><div><p className="text-sm text-muted-foreground">В отчёте</p><p className="mt-1 whitespace-nowrap text-2xl font-semibold tabular">{check.reportValue}</p></div><div><p className="text-sm text-muted-foreground">По акту</p><p className="mt-1 whitespace-nowrap text-2xl font-semibold tabular">{check.sourceValue}</p></div></div>
          <p className="mt-3 font-medium text-danger">В отчёте на {check.discrepancy?.replace(/^\+/, "")} больше</p></>}
          {fragment && <div className="landing-document mt-5"><MarkProvider active={evidence?.locationInDocument} linked={new Set()}><SyntheticPage page={fragment} pageNumber={evidence?.pageNumber ?? 1} pageCount={doc?.pageCount ?? 1} /></MarkProvider></div>}
          <p className="mt-3 text-xs text-muted-foreground">Демонстрационные данные</p>
        </div>
      </section>
      <section className="border-y border-border py-6"><div className="grid gap-5 sm:grid-cols-3">{[{ Icon: FileText, title: "Отчёт и документы", text: "Суммы, количества, даты и реквизиты." }, { Icon: GitCompareArrows, title: "Откуда взято значение", text: "Показатель рядом с выделенной строкой первичного документа." }, { Icon: ClipboardCheck, title: "Решение проверяющего", text: "Замечания и источники в итоговом заключении." }].map(({ Icon, title, text }) => <div key={title} className="flex gap-3"><Icon className="mt-1 size-5 shrink-0 text-primary" /><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p></div></div>)}</div></section>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-6"><span className="text-sm text-muted-foreground">Sverko · Кейс № 5 хакатона МФТИ</span><Button asChild variant="link" className="px-0"><Link to="/audits/$id" params={{ id: DEMO_SESSION_ID }}>Открыть демо-проверку <ArrowRight /></Link></Button></div>
    </div>
  );
}
