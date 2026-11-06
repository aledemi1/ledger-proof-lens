import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, FileX2, Quote, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarkProvider, SyntheticPage } from "./SyntheticDocument";
import { FlowView, GridView, ImageView, PdfView } from "./RealDocument";
import { docTypeLabel } from "@/lib/documentTypes";
import { evidencePlace } from "@/lib/format";
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
  const [zoom, setZoom] = useState(1);
  const activeAnchor = p.evidence && p.evidence.documentId === p.docId ? p.evidence.locationInDocument : undefined;
  const scalable = doc?.preview.kind === "pdf" || doc?.preview.kind === "image";

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    let attempts = 0;
    const scroll = () => {
      const escaped = activeAnchor ? CSS.escape(activeAnchor) : "";
      const el = escaped ? root.querySelector<HTMLElement>(`[data-anchor="${escaped}"]`) : null;
      const page =
        p.evidence && p.evidence.documentId === p.docId && p.evidence.pageNumber > 0
          ? root.querySelector<HTMLElement>(`[data-page="${p.evidence.pageNumber}"]`)
          : null;
      const target = el ?? page;
      if (!target) return false;
      const r = target.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      root.scrollTo({ top: root.scrollTop + r.top - rr.top - rr.height / 3, behavior: "smooth" });
      return true;
    };
    if (!activeAnchor && !(p.evidence && p.evidence.documentId === p.docId && p.evidence.pageNumber > 0)) {
      root.scrollTo({ top: 0 });
      return;
    }
    if (scroll()) return;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (scroll() || attempts > 40) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [activeAnchor, p.docId, p.evidence, doc?.preview.kind]);

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
        {scalable && (
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setZoom((value) => Math.max(0.6, Math.round((value - 0.2) * 10) / 10))} aria-label="Уменьшить">
              <ZoomOut />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setZoom((value) => Math.min(2.4, Math.round((value + 0.2) * 10) / 10))} aria-label="Увеличить">
              <ZoomIn />
            </Button>
          </div>
        )}
        {doc && (doc.preview.kind === "synthetic" || doc.preview.kind === "pdf") && doc.pageCount > 1 && (
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
            <span className="text-muted-foreground">{evidencePlace(p.evidence)} · </span>
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
          <div><p className="font-medium">Подтверждающий документ не найден</p><p className="mt-1">Просмотр комплекта вручную</p></div>
        </div>
      )}

      <div ref={scrollRef} className="document-scroll relative min-h-0 flex-1 overflow-auto bg-muted/70 p-3">
        {!doc ? (
          <Empty text="Выберите показатель или документ для просмотра." />
        ) : doc.preview.kind === "none" ? (
          <Empty text={doc.preview.reason} />
        ) : doc.preview.kind === "grid" ? (
          <GridView sheets={doc.preview.sheets} active={activeAnchor} />
        ) : doc.preview.kind === "flow" ? (
          <FlowView blocks={doc.preview.blocks} active={activeAnchor} />
        ) : doc.preview.kind === "pdf" ? (
          <PdfView url={doc.preview.url} evidence={p.evidence && p.evidence.documentId === doc.id ? p.evidence : null} zoom={zoom} />
        ) : doc.preview.kind === "image" ? (
          <ImageView url={doc.preview.url} evidence={p.evidence && p.evidence.documentId === doc.id ? p.evidence : null} zoom={zoom} />
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
