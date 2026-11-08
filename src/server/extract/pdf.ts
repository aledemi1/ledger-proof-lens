import { importExternal } from "../external";
import type { Box, Fragment, ReadDocument } from "../model";
import { ocrUnavailableReason, recognizeImage } from "./ocr";

interface Glyph {
  text: string;
  box: Box;
}

export async function extractPdf(buffer: Buffer): Promise<ReadDocument> {
  const pdfjs = await importExternal<typeof import("pdfjs-dist/legacy/build/pdf.mjs")>("pdfjs-dist/legacy/build/pdf.mjs");
  let document: { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy?: () => Promise<void> };
  try {
    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableFontFace: true,
      useSystemFonts: false,
    });
    document = (await task.promise) as unknown as typeof document;
  } catch (error) {
    if (isPassword(error)) throw new Error("файл защищён паролем");
    const message = error instanceof Error ? error.message : "файл не читается";
    throw new Error(`файл повреждён (${message})`);
  }

  const fragments: Fragment[] = [];
  const warnings: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const glyphs = glyphsOf(content.items, viewport.width, viewport.height);
      const lines = groupLines(glyphs);
      const pageText = lines.map((line) => line.text).join(" ").replace(/\s+/g, " ").trim();
      if (pageText.length >= 20) {
        lines.forEach((line, index) => {
          const anchor = `p${pageNumber}l${index + 1}`;
          fragments.push({
            id: anchor,
            text: line.text,
            pageNumber,
            locationLabel: `Стр. ${pageNumber}`,
            anchor,
            shape: "line",
            box: line.box,
            tokens: line.tokens,
          });
        });
        continue;
      }
      const rendered = await renderPage(page, viewport.width, viewport.height);
      if (!rendered) {
        warnings.push(`Страница ${pageNumber} без текстового слоя, и страницу не удалось подготовить для OCR.`);
        continue;
      }
      try {
        const recognized = await recognizeImage(rendered, Math.ceil(page.getViewport({ scale: 2 }).width), Math.ceil(page.getViewport({ scale: 2 }).height), "image/png");
        if (!recognized.lines.length) {
          warnings.push(`Страница ${pageNumber}: распознавание не нашло текста.`);
          continue;
        }
        if (recognized.engine === "model") warnings.push(`Страница ${pageNumber}: текст распознан запасным OCR без координат строк.`);
        recognized.lines.forEach((line, index) => {
          const anchor = `p${pageNumber}o${index + 1}`;
          fragments.push({
            id: anchor,
            text: line.text,
            pageNumber,
            locationLabel: `Стр. ${pageNumber}`,
            anchor,
            shape: "line",
            ...(line.box ? { box: line.box } : {}),
            ...(line.tokens ? { tokens: line.tokens } : {}),
          });
        });
      } catch (error) {
        warnings.push(`Страница ${pageNumber}: ${ocrUnavailableReason(error)}`);
      }
    }
  } finally {
    await document.destroy?.();
  }

  if (!fragments.length && warnings.length) {
    throw new Error(warnings[0] ?? "не удалось прочитать PDF");
  }
  if (!fragments.length) throw new Error("в PDF не найден ни текст, ни распознаваемые страницы");

  return {
    fragments,
    preview: { kind: "pdf", pageCount: document.numPages },
    pageCount: document.numPages,
    text: fragments.map((fragment) => fragment.text).join("\n"),
    warnings,
  };
}

interface PdfPage {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  getTextContent: () => Promise<{ items: unknown[] }>;
  render: (params: { canvas: unknown; canvasContext: unknown; viewport: { width: number; height: number } }) => { promise: Promise<void> };
}

function glyphsOf(items: unknown[], pageWidth: number, pageHeight: number): Glyph[] {
  const glyphs: Glyph[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || !("str" in item)) continue;
    const str = String((item as { str: unknown }).str);
    if (!str.trim()) continue;
    const transform = (item as { transform?: number[] }).transform ?? [];
    const x = transform[4] ?? 0;
    const y = transform[5] ?? 0;
    const width = Number((item as { width?: number }).width ?? 0);
    const fontHeight = Math.abs(transform[3] ?? 0) || Number((item as { height?: number }).height ?? 10);
    glyphs.push({
      text: str,
      box: {
        x: x / pageWidth,
        y: (pageHeight - y - fontHeight) / pageHeight,
        width: Math.max(width, 1) / pageWidth,
        height: Math.max(fontHeight, 1) / pageHeight,
      },
    });
  }
  return glyphs;
}

function groupLines(glyphs: Glyph[]): { text: string; box: Box; tokens: { text: string; box: Box }[] }[] {
  const remaining = glyphs.slice().sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const lines: Glyph[][] = [];
  for (const glyph of remaining) {
    const line = lines.find((items) => {
      const sample = items[0];
      if (!sample) return false;
      return Math.abs(sample.box.y - glyph.box.y) < Math.max(sample.box.height, glyph.box.height) * 0.6;
    });
    if (line) line.push(glyph);
    else lines.push([glyph]);
  }
  return lines.map((line) => {
    const ordered = line.slice().sort((a, b) => a.box.x - b.box.x);
    let text = "";
    let prev: Glyph | undefined;
    for (const glyph of ordered) {
      if (prev && !text.endsWith(" ") && !glyph.text.startsWith(" ")) {
        const gap = glyph.box.x - (prev.box.x + prev.box.width);
        if (gap > prev.box.height * 0.15) text += " ";
      }
      text += glyph.text;
      prev = glyph;
    }
    return { text: text.replace(/\s+/g, " ").trim(), box: union(ordered.map((glyph) => glyph.box)), tokens: ordered.map((glyph) => ({ text: glyph.text, box: glyph.box })) };
  }).filter((line) => line.text);
}

function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x, y, width: right - x, height: bottom - y };
}

async function renderPage(page: PdfPage, _width: number, _height: number): Promise<Buffer | null> {
  try {
    const canvasMod = await import("@napi-rs/canvas");
    const viewport = page.getViewport({ scale: 2 });
    const canvas = canvasMod.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return canvas.toBuffer("image/png");
  } catch {
    return null;
  }
}

function isPassword(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String(error.message) : "";
  return /password/i.test(name) || /password/i.test(message);
}
