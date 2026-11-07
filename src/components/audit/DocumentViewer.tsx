import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FileSpreadsheet, FileText, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkProvider, SyntheticPage } from "./SyntheticDocument";
import { FlowView, GridView, ImageView, PdfView, type MarkLayer } from "./RealDocument";
import { docTypeLabel } from "@/lib/documentTypes";
import type { DocMark } from "@/lib/marks";
import type { AuditDocument, CheckStatus, EvidenceReference } from "@/types/audit";

interface Props {
  doc: AuditDocument | null;
  /** Spots in this document that belong to checks; coloured by category and clickable. */
  marks: DocMark[];
  /** Reference to scroll to and outline. Ignored when it belongs to another document. */
  focus: EvidenceReference | null;
  onMarkClick?: (mark: DocMark) => void;
  /** Rendered between the toolbar and the page, e.g. the report-versus-source comparison. */
  banner?: ReactNode;
  emptyText?: string;
}

export function DocumentViewer(p: Props) {
  const doc = p.doc;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const focus = p.focus && doc && p.focus.documentId === doc.id ? p.focus : null;
  const activeAnchor = focus?.locationInDocument;
  const scalable = doc?.preview.kind === "pdf" || doc?.preview.kind === "image";

  const layer = useMemo<MarkLayer>(() => {
    const marks = new Map<string, DocMark>();
    p.marks.forEach((mark) => mark.anchor && marks.set(mark.anchor, mark));
    return { marks, active: activeAnchor, onMark: p.onMarkClick };
  }, [p.marks, activeAnchor, p.onMarkClick]);
  const statuses = useMemo(() => {
    const map = new Map<string, CheckStatus>();
    layer.marks.forEach((mark, anchor) => map.set(anchor, mark.status));
    return map;
  }, [layer]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [doc?.id]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !focus) return;
    let attempts = 0;
    const scroll = () => {
      const el = activeAnchor ? root.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(activeAnchor)}"]`) : null;
      const page = focus.pageNumber > 0 ? root.querySelector<HTMLElement>(`[data-page="${focus.pageNumber}"]`) : null;
      const target = el ?? page;
      if (!target) return false;
      const r = target.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      root.scrollTo({ top: root.scrollTop + r.top - rr.top - rr.height / 3, left: Math.max(0, root.scrollLeft + r.left - rr.left - rr.width / 3), behavior: "smooth" });
      return true;
    };
    if (scroll()) return;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (scroll() || attempts > 40) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [activeAnchor, focus, doc?.id, doc?.preview.kind]);

  const scrollToPage = (n: number) => {
    scrollRef.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const isSheet = doc?.type === "report";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          {isSheet ? <FileSpreadsheet className="size-4" /> : <FileText className="size-4" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={doc?.name}>{doc?.name ?? "Документ не выбран"}</span>
        {doc && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{docTypeLabel[doc.type]}</span>}
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
              <button key={i} onClick={() => scrollToPage(i + 1)} className="h-6 min-w-6 rounded px-1 text-xs text-muted-foreground hover:bg-muted">
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {p.banner}

      <div ref={scrollRef} className="document-scroll relative min-h-0 flex-1 overflow-auto bg-muted/70 p-3">
        {!doc ? (
          <Empty text={p.emptyText ?? "Выберите документ для просмотра."} />
        ) : doc.preview.kind === "none" ? (
          <Empty text={doc.preview.reason} />
        ) : doc.preview.kind === "grid" ? (
          <GridView sheets={doc.preview.sheets} layer={layer} />
        ) : doc.preview.kind === "flow" ? (
          <FlowView blocks={doc.preview.blocks} layer={layer} />
        ) : doc.preview.kind === "pdf" ? (
          <PdfView url={doc.preview.url} layer={layer} focus={focus} zoom={zoom} />
        ) : doc.preview.kind === "image" ? (
          <ImageView url={doc.preview.url} layer={layer} focus={focus} zoom={zoom} />
        ) : (
          <MarkProvider
            active={activeAnchor}
            linked={new Set()}
            statuses={statuses}
            onMarkClick={(anchor) => {
              const mark = layer.marks.get(anchor);
              if (mark) p.onMarkClick?.(mark);
            }}
          >
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
