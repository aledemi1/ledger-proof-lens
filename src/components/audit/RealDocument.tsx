import { useEffect, useState } from "react";
import type { EvidenceReference, FlowBlock, GridSheet } from "@/types/audit";
import { cn } from "@/lib/utils";

export function GridView({ sheets, active }: { sheets: GridSheet[]; active?: string | undefined }) {
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
                  {row.cells.map((cell) => (
                    <td
                      key={cell.anchor}
                      data-anchor={cell.anchor}
                      className={cn("border border-border px-2 py-1 align-top", cell.anchor === active && "doc-mark-active")}
                    >
                      <div className="text-[10px] text-muted-foreground">{cell.address}</div>
                      <div>{cell.text || "—"}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function FlowView({ blocks, active }: { blocks: FlowBlock[]; active?: string | undefined }) {
  return (
    <div className="mx-auto max-w-3xl rounded-md border border-border bg-white p-6 shadow-panel text-sm leading-relaxed">
      {blocks.map((block, index) =>
        block.kind === "paragraph" ? (
          <p key={block.anchor ?? index} data-anchor={block.anchor} className={cn("mb-3", block.anchor === active && "doc-mark-active")}>
            {block.text}
          </p>
        ) : (
          <table key={index} className="mb-4 w-full border-collapse text-xs">
            <tbody>
              {block.rows?.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.cells.map((cell) => (
                    <td key={cell.anchor} data-anchor={cell.anchor} className={cn("border border-border px-2 py-1", cell.anchor === active && "doc-mark-active")}>
                      {cell.text}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ),
      )}
    </div>
  );
}

export function ImageView({ url, evidence, zoom }: { url: string; evidence: EvidenceReference | null; zoom: number }) {
  const marked = evidence?.box && evidence.locationInDocument ? evidence : null;
  return (
    <div className="mx-auto" style={{ width: `${zoom * 100}%`, maxWidth: 920 * zoom }}>
      <div className="relative inline-block bg-white shadow">
        <img src={url} alt="" className="block h-auto w-full" />
        {marked?.box && (
          <div
            data-anchor={marked.locationInDocument}
            className="pdf-hit"
            style={{
              left: `${marked.box.x * 100}%`,
              top: `${marked.box.y * 100}%`,
              width: `${marked.box.width * 100}%`,
              height: `${marked.box.height * 100}%`,
            }}
          />
        )}
        {evidence?.locationInDocument && !evidence.box && <div data-anchor={evidence.locationInDocument} />}
      </div>
    </div>
  );
}

export function PdfView({ url, evidence, zoom }: { url: string; evidence: EvidenceReference | null; zoom: number }) {
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
    <div className="mx-auto flex flex-col gap-4" style={{ width: Math.round((pages[0]?.width ?? 600) * zoom) }}>
      {pages.map((page) => {
        const onPage = evidence?.pageNumber === page.page ? evidence : null;
        return (
          <div key={page.page} data-page={page.page} className="relative bg-white shadow" style={{ width: page.width * zoom, height: page.height * zoom }}>
            <img src={page.src} alt="" className="h-full w-full" />
            {onPage?.box && onPage.locationInDocument && (
              <div
                data-anchor={onPage.locationInDocument}
                className="pdf-hit"
                style={{
                  left: `${onPage.box.x * 100}%`,
                  top: `${onPage.box.y * 100}%`,
                  width: `${onPage.box.width * 100}%`,
                  height: `${onPage.box.height * 100}%`,
                }}
              />
            )}
            {onPage?.locationInDocument && !onPage.box && <div data-anchor={onPage.locationInDocument} />}
          </div>
        );
      })}
    </div>
  );
}
