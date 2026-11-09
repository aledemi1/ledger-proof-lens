import path from "node:path";
import { importExternal } from "../external";
import type { Box } from "../model";
import { dataDir } from "../paths";

export interface OcrLine {
  text: string;
  box?: Box;
  tokens?: { text: string; box: Box }[];
}

export interface OcrResult {
  lines: OcrLine[];
  engine: "tesseract" | "model";
}

let workerPromise: Promise<{ recognize: (image: Buffer, width: number, height: number) => Promise<OcrLine[]> } | null> | undefined;

async function getWorker() {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    try {
      const { createWorker, PSM } = await importExternal<typeof import("tesseract.js")>("tesseract.js");
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

let slotTaken = false;
const slotWaiters: Array<() => void> = [];
let primaryForTests: ((buffer: Buffer, width: number, height: number) => Promise<OcrLine[]>) | undefined;

/** Test hook. Pass null to use Tesseract again. */
export function setPrimaryOcrForTests(primary: ((buffer: Buffer, width: number, height: number) => Promise<OcrLine[]>) | null): void {
  primaryForTests = primary ?? undefined;
  slotTaken = false;
  slotWaiters.splice(0);
}

export async function recognizeImage(buffer: Buffer, width: number, height: number, mime = "image/png"): Promise<OcrResult> {
  void mime;
  await acquireSlot();
  try {
    const lines = primaryForTests ? await primaryForTests(buffer, width, height) : await recognizeWithTesseract(buffer, width, height);
    return { lines, engine: "tesseract" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR недоступен";
    throw new Error(`${message} Изображение не отправляется во внешнюю модель.`);
  } finally {
    releaseSlot();
  }
}

function acquireSlot(): Promise<void> {
  if (!slotTaken) {
    slotTaken = true;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    slotWaiters.push(() => {
      slotTaken = true;
      resolve();
    });
  });
}

function releaseSlot(): void {
  const next = slotWaiters.shift();
  if (next) next();
  else slotTaken = false;
}

async function recognizeWithTesseract(buffer: Buffer, width: number, height: number): Promise<OcrLine[]> {
  const worker = await getWorker();
  if (!worker) return [];
  return worker.recognize(buffer, width, height);
}

/** Kept so older notes can name the model that no longer receives page images. */
export const UPLOADED_IMAGE_MODEL = "local-tesseract";

export async function recognizeUploadedImage(buffer: Buffer, width: number, height: number, mime = "image/png"): Promise<OcrResult> {
  return recognizeImage(buffer, width, height, mime);
}

export function linesFromOcrPayload(content: string): string[] {
  const cleaned = content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as { lines?: unknown };
    if (!Array.isArray(parsed.lines)) return [];
    return parsed.lines.filter((line): line is string => typeof line === "string" && line.trim().length > 0).map((line) => line.trim());
  } catch {
    return cleaned.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  }
}

export function ocrUnavailableReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "не удалось запустить распознавание";
  return `OCR недоступен (${message}). Для скана нужен языковой пакет rus.`;
}
