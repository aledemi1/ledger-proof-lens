import path from "node:path";
import type { Box } from "../model";
import { dataDir } from "../paths";

export interface OcrLine {
  text: string;
  box: Box;
  tokens: { text: string; box: Box }[];
}

let workerPromise: Promise<{ recognize: (image: Buffer, width: number, height: number) => Promise<OcrLine[]> } | null> | undefined;

async function getWorker() {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    try {
      const { createWorker, PSM } = await import("tesseract.js");
      const worker = await createWorker("rus+eng", 1, {
        cachePath: path.join(dataDir(), "tessdata"),
      });
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, user_defined_dpi: "300" });
      return {
        recognize: async (image: Buffer, width: number, height: number) => {
          const result = await worker.recognize(image, {}, { text: true, blocks: true });
          return linesFrom(result.data, width, height);
        },
      };
    } catch (error) {
      workerPromise = undefined;
      const message = error instanceof Error ? error.message : "OCR недоступен";
      throw new Error(message);
    }
  })();
  return workerPromise;
}

function linesFrom(
  data: {
    blocks?: {
      paragraphs?: {
        lines?: {
          words?: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence: number }[];
        }[];
      }[];
    }[] | null;
  },
  width: number,
  height: number,
): OcrLine[] {
  const lines: OcrLine[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const words = (line.words ?? []).filter((word) => word.text.trim() && word.confidence >= 0);
        if (!words.length) continue;
        const ordered = words.slice().sort((a, b) => a.bbox.x0 - b.bbox.x0);
        const tokens = ordered.map((word) => ({ text: word.text, box: boxOf(word.bbox, width, height) }));
        const x0 = Math.min(...ordered.map((word) => word.bbox.x0));
        const y0 = Math.min(...ordered.map((word) => word.bbox.y0));
        const x1 = Math.max(...ordered.map((word) => word.bbox.x1));
        const y1 = Math.max(...ordered.map((word) => word.bbox.y1));
        lines.push({ text: ordered.map((word) => word.text).join(" "), box: boxOf({ x0, y0, x1, y1 }, width, height), tokens });
      }
    }
  }
  return lines.filter((line) => line.text.trim());
}

function boxOf(b: { x0: number; y0: number; x1: number; y1: number }, width: number, height: number): Box {
  return {
    x: clamp(b.x0 / width),
    y: clamp(b.y0 / height),
    width: clamp((b.x1 - b.x0) / width),
    height: clamp((b.y1 - b.y0) / height),
  };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export async function recognizeImage(buffer: Buffer, width: number, height: number): Promise<OcrLine[]> {
  const worker = await getWorker();
  if (!worker) return [];
  return worker.recognize(buffer, width, height);
}

export function ocrUnavailableReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "не удалось запустить распознавание";
  return `OCR недоступен (${message}). Для скана нужен языковой пакет rus.`;
}
