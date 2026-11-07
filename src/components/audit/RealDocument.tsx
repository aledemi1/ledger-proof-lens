import { useEffect, useState } from "react";
import type { EvidenceReference, FlowBlock, GridSheet } from "@/types/audit";
import type { DocMark } from "@/lib/marks";
import { cn } from "@/lib/utils";

export interface MarkLayer {
  /** Marks keyed by anchor. */
  marks: Map<string, DocMark>;
  active?: string | undefined;
  onMark?: ((mark: DocMark) => void) | undefined;
}

function markProps(anchor: string, layer: MarkLayer) {
  const mark = layer.marks.get(anchor);
  const active = anchor === layer.active;
  if (!mark) return { className: active ? "doc-mark-active" : undefined };
  return {
    "data-status": mark.status,
    className: cn("status-mark", active && "is-active"),
    onClick: layer.onMark ? () => layer.onMark?.(mark) : undefined,
  };
}

export function GridView({ sheets, layer }: { sheets: GridSheet[]; layer: MarkLayer }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {sheets.map((sheet) => (
        <div key={sheet.name} className="overflow-auto rounded-md border border-border bg-white shadow-panel">
          <div className="border-b border-border px-3 py-1.5 text-xs font-medium">{sheet.name}</div>
          <table className="w-full border-collapse text-xs">
            <tbody>
              {sheet.rows.map((row) => (
                <tr key={row.index}>
                  <td className="w-8 border border-border bg-muted/50 px-1 text-center text-[10px] text-muted-foreground">{row.index}</td>
                  {row.cells.map((cell) => {
                    const mark = markProps(cell.anchor, layer);
                    return (
                      <td key={cell.anchor} data-anchor={cell.anchor} {...mark} className={cn("border border-border px-2 py-1 align-top", mark.className)}>
                        <div className="text-[10px] text-muted-foreground">{cell.address}</div>
                        <div>{cell.text || "—"}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function FlowView({ blocks, layer }: { blocks: FlowBlock[]; layer: MarkLayer }) {
  return (
    <div className="mx-auto max-w-3xl rounded-md border border-border bg-white p-6 shadow-panel text-sm leading-relaxed">
      {blocks.map((block, index) => {
        if (block.kind === "paragraph") {
          const mark = block.anchor ? markProps(block.anchor, layer) : { className: undefined };
          return (
            <p key={block.anchor ?? index} data-anchor={block.anchor} {...mark} className={cn("mb-3", mark.className)}>
              {block.text}
            </p>
          );
        }
        return (
          <table key={index} className="mb-4 w-full border-collapse text-xs">
            <tbody>
              {block.rows?.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.cells.map((cell) => {
                    const mark = markProps(cell.anchor, layer);
                    return (
                      <td key={cell.anchor} data-anchor={cell.anchor} {...mark} className={cn("border border-border px-2 py-1", mark.className)}>
                        {cell.text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}

/** Boxes measured by the extractor on one page; the focused reference keeps an anchor even without a box. */
function PageMarks({ page, layer, focus }: { page: number | null; layer: MarkLayer; focus: EvidenceReference | null }) {
  const boxes = [...layer.marks.values()].filter((mark) => mark.box && (page == null || mark.page === page));
  const focusAnchor = focus && (page == null || focus.pageNumber === page) ? focus.locationInDocument : undefined;
  const focusBoxed = focusAnchor != null && boxes.some((mark) => mark.anchor === focusAnchor);
  return (
    <>
      {boxes.map((mark) => (
        <div
          key={mark.anchor}
          data-anchor={mark.anchor}
          data-status={mark.status}
          className={cn("status-box", mark.anchor === layer.active && "is-active")}
          onClick={layer.onMark ? () => layer.onMark?.(mark) : undefined}
          style={{
            left: `${mark.box!.x * 100}%`,
            top: `${mark.box!.y * 100}%`,
            width: `${mark.box!.width * 100}%`,
            height: `${mark.box!.height * 100}%`,
          }}
        />
      ))}
      {focusAnchor && !focusBoxed && <div data-anchor={focusAnchor} />}
    </>
  );
}

export function ImageView({ url, layer, focus, zoom }: { url: string; layer: MarkLayer; focus: EvidenceReference | null; zoom: number }) {
  return (
    <div className="mx-auto" style={{ width: `${zoom * 100}%`, maxWidth: 920 * zoom }}>
      <div className="relative inline-block bg-white shadow">
        <img src={url} alt="" className="block h-auto w-full" />
        <PageMarks page={null} layer={layer} focus={focus} />
      </div>
    </div>
  );
}

export function PdfView({ url, layer, focus, zoom }: { url: string; layer: MarkLayer; focus: EvidenceReference | null; zoom: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<{ page: number; src: string; width: number; height: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPages([]);
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const worker = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.toString();
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) throw new Error("Не удалось открыть файл");
        const data = new Uint8Array(await response.arrayBuffer());
        const pdf = await pdfjs.getDocument({ data }).promise;
        const rendered: { page: number; src: string; width: number; height: number }[] = [];
        for (let number = 1; number <= pdf.numPages; number += 1) {
          const page = await pdf.getPage(number);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext("2d");
          if (!context) continue;
          await page.render({ canvasContext: context, canvas, viewport }).promise;
          rendered.push({ page: number, src: canvas.toDataURL("image/png"), width: viewport.width, height: viewport.height });
          if (cancelled) return;
        }
        if (!cancelled) setPages(rendered);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Не удалось показать PDF");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) return <p className="p-6 text-center text-sm text-muted-foreground">{error}</p>;
  if (!pages.length) return <p className="p-6 text-center text-sm text-muted-foreground">Открываю документ…</p>;
  return (
    <div className="mx-auto flex flex-col gap-4" style={{ width: `${zoom * 100}%`, maxWidth: Math.round((pages[0]?.width ?? 600) * zoom) }}>
      {pages.map((page) => (
        <div key={page.page} data-page={page.page} className="relative w-full bg-white shadow" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
          <img src={page.src} alt="" className="h-full w-full" />
          <PageMarks page={page.page} layer={layer} focus={focus} />
        </div>
      ))}
    </div>
  );
}
