import { useEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { EvidenceReference, FlowBlock, GridCell, GridSheet } from "@/types/audit";
import type { DocMark } from "@/lib/marks";
import { fill } from "@/i18n/fill";
import { useCopy } from "@/i18n/messages";
import { imagePreviewWidth, pdfPreviewScale } from "@/lib/previewScale";
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

/** 1-based column index of an address such as "B12" or "AA3". */
function columnNumber(address: string): number {
  const letters = address.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "";
  let number = 0;
  for (const char of letters) number = number * 26 + (char.charCodeAt(0) - 64);
  return number;
}

function columnName(number: number): string {
  let value = number;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function sheetMatrix(sheet: GridSheet): { cells: Map<string, GridCell>; columns: number; rows: number } {
  const cells = new Map<string, GridCell>();
  let maxColumn = 1;
  let maxRow = 1;
  for (const row of sheet.rows) {
    maxRow = Math.max(maxRow, row.index);
    for (const cell of row.cells) {
      const column = columnNumber(cell.address);
      if (!column) continue;
      maxColumn = Math.max(maxColumn, column);
      cells.set(`${column}:${row.index}`, cell);
    }
  }
  const columns = Math.max(maxColumn, 8);
  const rows = Math.max(maxRow, 24);
  const tooWide = columns * rows > 6000;
  return { cells, columns: tooWide ? maxColumn : columns, rows: tooWide ? maxRow : rows };
}

export function GridView({ sheets, layer, scrollRef }: { sheets: GridSheet[]; layer: MarkLayer; scrollRef: RefObject<HTMLDivElement | null> }) {
  const t = useCopy();
  const activeKey = layer.active ?? "";
  const marked = sheets.findIndex((sheet) => sheet.rows.some((row) => row.cells.some((cell) => cell.anchor === activeKey)));
  const [seen, setSeen] = useState(activeKey);
  const [picked, setPicked] = useState(marked >= 0 ? marked : 0);
  if (seen !== activeKey) {
    setSeen(activeKey);
    if (marked >= 0) setPicked(marked);
  }
  const index = sheets.length ? Math.min(picked, sheets.length - 1) : 0;
  const sheet = sheets[index];

  return (
    <div className="excel-workbook flex h-full min-h-0 flex-col bg-[#f3f3f3] text-ink">
      <div ref={scrollRef} className="excel-scroll min-h-0 flex-1 overflow-auto bg-white">
        {sheet ? <ExcelSheet sheet={sheet} layer={layer} /> : null}
      </div>
      {sheets.length > 0 && (
        <div className="flex items-end gap-px overflow-x-auto border-t border-[#b4b4b4] bg-[#f3f3f3] px-1 pt-1" role="tablist" aria-label={t.work.sheets}>
          {sheets.map((item, itemIndex) => (
            <button
              key={item.name}
              type="button"
              role="tab"
              aria-selected={itemIndex === index}
              onClick={() => {
                setPicked(itemIndex);
                scrollRef.current?.scrollTo({ top: 0, left: 0 });
              }}
              className={cn(
                "max-w-48 truncate rounded-t border border-b-0 px-3 py-1 text-xs",
                itemIndex === index ? "border-[#b4b4b4] bg-white font-medium text-foreground" : "border-transparent text-muted-foreground hover:bg-white/80",
              )}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function columnWidths(sheet: GridSheet, columns: number, cells: Map<string, GridCell>): number[] {
  return Array.from({ length: columns }, (_, index) => {
    const stored = sheet.widths?.[index] ?? 0;
    if (stored >= 48) return Math.min(stored, 480);
    let longest = 8;
    for (const [key, cell] of cells) {
      if (Number(key.split(":")[0]) !== index + 1) continue;
      longest = Math.max(longest, Math.min(cell.text.length, 48));
    }
    return Math.min(420, Math.max(96, longest * 8 + 18));
  });
}

function ExcelSheet({ sheet, layer }: { sheet: GridSheet; layer: MarkLayer }) {
  const t = useCopy();
  const { cells, columns, rows } = sheetMatrix(sheet);
  const [widths, setWidths] = useState(() => columnWidths(sheet, columns, cells));
  const [sheetName, setSheetName] = useState(sheet.name);
  if (sheetName !== sheet.name) {
    setSheetName(sheet.name);
    setWidths(columnWidths(sheet, columns, cells));
  }
  let activeColumn = 0;
  let activeRow = 0;
  if (layer.active) {
    for (const [key, cell] of cells) {
      if (cell.anchor !== layer.active) continue;
      const [column, row] = key.split(":");
      activeColumn = Number(column);
      activeRow = Number(row);
      break;
    }
  }
  const letters = Array.from({ length: columns }, (_, index) => columnName(index + 1));
  const template = `46px ${widths.map((width) => `${width}px`).join(" ")}`;

  const startResize = (index: number, event: ReactPointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const start = widths[index] ?? 120;
    const move = (pointer: PointerEvent) => {
      const next = Math.max(64, Math.min(560, start + pointer.clientX - startX));
      setWidths((current) => current.map((width, column) => (column === index ? next : width)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  return (
    <div className="excel-grid text-[13px] leading-5" style={{ gridTemplateColumns: template }}>
      <div className="excel-corner" />
      {letters.map((letter, index) => (
        <div key={letter} className={cn("excel-col", index + 1 === activeColumn && "excel-axis-active")}>
          {letter}
          <span className="excel-resize" role="separator" aria-orientation="vertical" aria-label={fill(t.work.columnWidth, { letter })} onPointerDown={(event) => startResize(index, event)} />
        </div>
      ))}
      {Array.from({ length: rows }, (_, offset) => {
        const rowNumber = offset + 1;
        return (
          <div key={rowNumber} className="contents">
            <div className={cn("excel-row", rowNumber === activeRow && "excel-axis-active")}>{rowNumber}</div>
            {letters.map((letter, columnOffset) => {
              const cell = cells.get(`${columnOffset + 1}:${rowNumber}`);
              if (!cell) return <div key={letter} className="excel-cell" />;
              const mark = markProps(cell.anchor, layer);
              return (
                <div key={cell.anchor} data-anchor={cell.anchor} title={cell.text} {...mark} className={cn("excel-cell", mark.className)}>
                  {cell.text}
                </div>
              );
            })}
          </div>
        );
      })}
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

function screenRatio(): number {
  if (typeof window === "undefined") return 1;
  return window.devicePixelRatio || 1;
}

export function ImageView({ url, layer, focus, zoom }: { url: string; layer: MarkLayer; focus: EvidenceReference | null; zoom: number }) {
  const [naturalWidth, setNaturalWidth] = useState(0);
  const width = naturalWidth ? imagePreviewWidth(naturalWidth, zoom, screenRatio()) : undefined;
  return (
    <div className="mx-auto w-max">
      <div className="relative inline-block bg-white shadow">
        <img
          src={url}
          alt=""
          className="block h-auto max-w-none"
          style={width ? { width, maxWidth: "none" } : { maxWidth: "none" }}
          onLoad={(event) => setNaturalWidth(event.currentTarget.naturalWidth)}
        />
        <PageMarks page={null} layer={layer} focus={focus} />
      </div>
    </div>
  );
}

export function PdfView({ url, layer, focus, zoom }: { url: string; layer: MarkLayer; focus: EvidenceReference | null; zoom: number }) {
  const t = useCopy();
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<{ page: number; src: string; width: number; height: number }[]>([]);
  const [showFile, setShowFile] = useState(false);
  const [shownUrl, setShownUrl] = useState(url);
  if (shownUrl !== url) {
    setShownUrl(url);
    setPages([]);
    setError(null);
    setShowFile(false);
  }

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) throw new Error(t.work.fileOpenFailed);
        const data = new Uint8Array(await response.arrayBuffer());
        const pdf = await pdfjs.getDocument({ data, standardFontDataUrl: "/pdfjs/standard_fonts/" }).promise;
        const rendered: { page: number; src: string; width: number; height: number }[] = [];
        const pixelRatio = screenRatio();
        const paint = async (page: Awaited<ReturnType<typeof pdf.getPage>>, scale: number, density: number) => {
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.floor(viewport.width * density));
          canvas.height = Math.max(1, Math.floor(viewport.height * density));
          const transform = density === 1 ? undefined : [density, 0, 0, density, 0, 0];
          await page.render({ canvas, viewport, ...(transform ? { transform } : {}) }).promise;
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), "image/png"));
          if (!blob) throw new Error("blob");
          return { src: URL.createObjectURL(blob), width: viewport.width, height: viewport.height };
        };
        try {
          for (let number = 1; number <= pdf.numPages; number += 1) {
            const page = await pdf.getPage(number);
            const base = page.getViewport({ scale: 1 });
            const outputScale = Math.min(Math.max(pixelRatio, 1), 2);
            let painted: { src: string; width: number; height: number };
            try {
              painted = await paint(page, pdfPreviewScale(base.width, base.height, zoom, pixelRatio), outputScale);
            } catch {
              painted = await paint(page, 1.5, 1);
            }
            rendered.push({ page: number, ...painted });
            if (cancelled) return;
          }
          if (!cancelled) setPages(rendered);
        } catch {
          if (!cancelled) setShowFile(true);
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : t.work.pdfFailed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, zoom]);

  if (error) return <p className="p-6 text-center text-sm text-muted-foreground">{error}</p>;
  if (showFile || !pages.length) {
    return <object data={url} type="application/pdf" className="h-full min-h-[70vh] w-full bg-white" aria-label={t.work.opening} />;
  }
  return (
    <div className="mx-auto flex w-max flex-col gap-4">
      {pages.map((page) => (
        <div key={page.page} data-page={page.page} className="relative bg-white shadow" style={{ width: page.width, aspectRatio: `${page.width} / ${page.height}` }}>
          <img src={page.src} alt="" className="block h-full w-full max-w-none" style={{ maxWidth: "none" }} />
          <PageMarks page={page.page} layer={layer} focus={focus} />
        </div>
      ))}
    </div>
  );
}
