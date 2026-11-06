import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, FileX2, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarkProvider, SyntheticPage } from "./SyntheticDocument";
import { docTypeLabel } from "@/lib/documentTypes";
import type { AuditDocument, EvidenceReference } from "@/types/audit";

interface Props {
  documents: AuditDocument[];
  docId: string | null;
  onDocChange: (id: string) => void;
  /** Evidence currently in focus (if it belongs to the open document). */
  evidence: EvidenceReference | null;
  evidenceIndex: number;
  evidenceCount: number;
  onEvidenceStep: (dir: -1 | 1) => void;
  sourceDocIds: string[];
  linkedAnchors: Set<string>;
  onMarkClick: (anchor: string) => void;
  notFoundNotice?: string | null;
}

export function DocumentViewer(p: Props) {
  const doc = p.documents.find((d) => d.id === p.docId) ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeAnchor = p.evidence && p.evidence.documentId === p.docId ? p.evidence.locationInDocument : undefined;

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const t = window.setTimeout(() => {
      const el = activeAnchor ? root.querySelector<HTMLElement>(`[data-anchor="${activeAnchor}"]`) : null;
      if (el) {
        const r = el.getBoundingClientRect();
        const rr = root.getBoundingClientRect();
        root.scrollTo({ top: root.scrollTop + r.top - rr.top - rr.height / 3, behavior: "smooth" });
      } else {
        root.scrollTo({ top: 0 });
      }
    }, 30);
    return () => window.clearTimeout(t);
  }, [activeAnchor, p.docId]);

  const scrollToPage = (n: number) => {
    scrollRef.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const sources = p.documents.filter((d) => p.sourceDocIds.includes(d.id));
  const others = p.documents.filter((d) => !p.sourceDocIds.includes(d.id));
  const isSheet = doc?.type === "report";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          {isSheet ? <FileSpreadsheet className="size-4" /> : <FileText className="size-4" />}
        </span>
        <Select value={p.docId ?? ""} onValueChange={p.onDocChange}>
          <SelectTrigger className="h-8 min-w-0 flex-1 border-transparent px-2 text-sm font-medium shadow-none hover:bg-muted">
            <SelectValue placeholder="Выберите документ" />
          </SelectTrigger>
          <SelectContent>
            {sources.length > 0 && (
              <SelectGroup>
                <SelectLabel>Источники показателя</SelectLabel>
                {sources.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectGroup>
            )}
            <SelectGroup>
              <SelectLabel>{sources.length ? "Другие документы" : "Документы проверки"}</SelectLabel>
              {others.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {doc && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{docTypeLabel[doc.type]}</span>
        )}
        {doc && doc.preview.kind === "synthetic" && doc.pageCount > 1 && (
          <div className="flex items-center gap-0.5">
            {Array.from({ length: doc.pageCount }, (_, i) => (
              <button
                key={i}
                onClick={() => scrollToPage(i + 1)}
                className="h-6 min-w-6 rounded px-1 text-xs text-muted-foreground hover:bg-muted"
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {p.evidence && p.evidence.documentId === p.docId && (
        <div className="flex items-center gap-2 border-b border-border bg-highlight/25 px-3 py-1.5 text-xs">
          <Quote className="size-3.5 shrink-0 text-warning" />
          <span className="min-w-0 flex-1 truncate">
            <span className="text-muted-foreground">Стр. {p.evidence.pageNumber} · </span>
            <span className="font-medium">{p.evidence.sourceText}</span>
          </span>
          {p.evidenceCount > 1 && (
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-muted-foreground">Источник {p.evidenceIndex + 1} из {p.evidenceCount}</span>
              <Button variant="ghost" size="icon" className="size-6" onClick={() => p.onEvidenceStep(-1)} aria-label="Предыдущий источник">
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon" className="size-6" onClick={() => p.onEvidenceStep(1)} aria-label="Следующий источник">
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      )}
      {p.notFoundNotice && (
        <div className="flex items-start gap-2 border-b border-border bg-orange-soft px-3 py-2 text-xs text-orange">
          <FileX2 className="mt-0.5 size-3.5 shrink-0" />
          <span>{p.notFoundNotice}</span>
        </div>
      )}

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto bg-muted/70 p-4 sm:p-6">
        {!doc ? (
          <Empty text="Выберите показатель или документ для просмотра." />
        ) : doc.preview.kind === "none" ? (
          <Empty text={doc.preview.reason} />
        ) : (
          <MarkProvider active={activeAnchor} linked={p.linkedAnchors} onMarkClick={p.onMarkClick}>
            <div className="flex flex-col gap-6">
              {doc.preview.pages.map((pg, i) => (
                <SyntheticPage key={`${doc.id}-${i}`} page={pg} pageNumber={i + 1} pageCount={doc.pageCount} sheet={isSheet} />
              ))}
            </div>
          </MarkProvider>
        )}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="grid h-full min-h-48 place-items-center text-center text-sm text-muted-foreground">
      <div className="max-w-xs">
        <FileText className="mx-auto mb-2 size-6 opacity-50" />
        {text}
      </div>
    </div>
  );
}
