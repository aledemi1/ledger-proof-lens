import type { DocumentPreview, EvidenceBox, FlowBlock, GridSheet } from "@/types/audit";

export interface Box extends EvidenceBox {}

export type FragmentShape = "kv" | "table" | "line" | "title";

export interface Fragment {
  id: string;
  text: string;
  pageNumber: number;
  locationLabel: string;
  anchor: string;
  shape: FragmentShape;
  box?: Box;
  sheet?: string;
  cell?: string;
  label?: string;
  columnHeader?: string;
  rowLabel?: string;
  unitHint?: string;
  formulaMissing?: boolean;
  tokens?: { text: string; box: Box }[];
}

export type PreviewDraft =
  | { kind: "grid"; sheets: GridSheet[] }
  | { kind: "flow"; blocks: FlowBlock[] }
  | { kind: "pdf"; pageCount: number }
  | { kind: "image"; width: number; height: number }
  | { kind: "none"; reason: string };

/** A rendered page kept in memory so the model can see it after personal data is painted over. */
export interface PageImage {
  pageNumber: number;
  image: Buffer;
  width: number;
  height: number;
}

export interface ReadDocument {
  fragments: Fragment[];
  preview: PreviewDraft;
  pageCount: number;
  /** Joined text for document-kind and copy detection. */
  text: string;
  warnings: string[];
  pages?: PageImage[];
}

export function withUrls(preview: PreviewDraft, fileUrl: string): DocumentPreview {
  if (preview.kind === "pdf") return { kind: "pdf", url: fileUrl, pageCount: preview.pageCount };
  if (preview.kind === "image") return { kind: "image", url: fileUrl, width: preview.width, height: preview.height };
  return preview;
}
