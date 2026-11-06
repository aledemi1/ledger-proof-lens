import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { DocBlock, DocPage, DocSegment } from "@/types/audit";

interface MarkCtx {
  active?: string | undefined;
  /** Anchors that are linked to some check — clickable. */
  linked: Set<string>;
  onMarkClick?: (anchor: string) => void;
}
const Ctx = createContext<MarkCtx>({ linked: new Set() });

function Segments({ segs }: { segs: DocSegment[] }) {
  const { active, linked, onMarkClick } = useContext(Ctx);
  return (
    <>
      {segs.map((s, i) => {
        if (typeof s === "string") return <span key={i}>{s}</span>;
        const isActive = s.anchor === active;
        const isLinked = linked.has(s.anchor);
        const sig = s.variant === "signature";
        return (
          <mark
            key={i}
            data-anchor={s.anchor}
            onClick={isLinked ? () => onMarkClick?.(s.anchor) : undefined}
            className={cn(
              "bg-transparent text-inherit",
              isLinked && "doc-mark",
              isActive && "doc-mark-active",
              sig && "inline-block -rotate-3 font-doc text-base italic tracking-widest opacity-50 blur-[0.6px]",
            )}
          >
            {s.text}
          </mark>
        );
      })}
    </>
  );
}

const alignCls = { left: "text-left", right: "text-right tabular", center: "text-center" };

function Block({ b }: { b: DocBlock }) {
  switch (b.kind) {
    case "title":
      return (
        <div className="mb-5 text-center">
          <h3 className="text-[15px] font-bold uppercase tracking-wide">
            <Segments segs={b.text} />
          </h3>
          {b.subtitle && (
            <p className="mt-1 text-xs">
              <Segments segs={b.subtitle} />
            </p>
          )}
        </div>
      );
    case "meta":
      return (
        <div className="mb-4 flex justify-between text-[13px]">
          <span><Segments segs={b.left} /></span>
          <span><Segments segs={b.right} /></span>
        </div>
      );
    case "paragraph":
      return (
        <p className="mb-3 text-justify text-[13px] leading-relaxed">
          <Segments segs={b.text} />
        </p>
      );
    case "fields":
      return (
        <dl className="mb-4 grid grid-cols-[minmax(120px,38%)_1fr] gap-x-3 gap-y-1.5 text-[13px]">
          {b.rows.map((r, i) => (
            <div key={i} className="contents">
              <dt className="text-ink/60">{r.label}:</dt>
              <dd className="font-medium"><Segments segs={r.value} /></dd>
            </div>
          ))}
        </dl>
      );
    case "table":
      return (
        <table className="mb-4 w-full border-collapse text-[12px]">
          <thead>
            <tr>
              {b.headers.map((h, i) => (
                <th key={i} className={cn("border border-ink/30 bg-ink/5 px-2 py-1 font-semibold", alignCls[b.align?.[i] ?? "left"])}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} className={cn("border border-ink/30 px-2 py-1.5", alignCls[b.align?.[ci] ?? "left"])}>
                    <Segments segs={[c]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "sheet":
      return (
        <table className="w-full border-collapse font-sans text-[12px]">
          <thead>
            <tr>
              <th className="w-8 border border-border bg-muted px-1 py-1 text-muted-foreground" />
              {b.headers.map((h, i) => (
                <th key={i} className="border border-border bg-muted px-2 py-1 text-left font-medium text-muted-foreground">
                  {String.fromCharCode(65 + i)} · {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, ri) => (
              <tr key={ri}>
                <td className="border border-border bg-muted px-1 text-center text-muted-foreground">{ri + 2}</td>
                {r.map((c, ci) => (
                  <td key={ci} className="border border-border px-2 py-1.5"><Segments segs={[c]} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "signatures":
      return (
        <div className="mt-8 grid grid-cols-2 gap-6 text-[12px]">
          {b.items.map((s, i) => (
            <div key={i}>
              <div className="text-ink/60">{s.role}</div>
              <div className="mt-3 flex items-end gap-2 border-b border-ink/40 pb-1">
                <span className="min-w-16"><Segments segs={s.sign} /></span>
                <span className="ml-auto">{s.name}</span>
              </div>
              <div className="mt-1 text-[10px] text-ink/50">подпись / расшифровка</div>
            </div>
          ))}
        </div>
      );
  }
}

export function SyntheticPage({
  page,
  pageNumber,
  pageCount,
  sheet,
}: {
  page: DocPage;
  pageNumber: number;
  pageCount: number;
  sheet?: boolean;
}) {
  return (
    <div
      data-page={pageNumber}
      className={cn(
        "relative mx-auto w-full max-w-[640px] bg-paper text-ink shadow-paper",
        sheet ? "rounded-md p-3" : "min-h-[560px] p-5 font-doc sm:p-6",
      )}
    >
      {page.blocks.map((b, i) => (
        <Block key={i} b={b} />
      ))}
      {!sheet && (
        <div className="absolute bottom-3 right-5 font-sans text-[10px] text-ink/40">
          Стр. {pageNumber} из {pageCount}
        </div>
      )}
    </div>
  );
}

export function MarkProvider(props: MarkCtx & { children: ReactNode }) {
  const { children, ...value } = props;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
