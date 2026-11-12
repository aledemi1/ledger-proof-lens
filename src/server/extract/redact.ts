import type { Box } from "../model";
import type { MaskMapping } from "../privacy";

export interface WordBox {
  text: string;
  box: Box;
}

export interface LabelCover {
  token: string;
  box: Box;
}

/** Digits and letters only, so an INN with spaces still matches the word Tesseract returned. */
export function compact(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, "");
}

function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/** Word spans whose text is a masked value. Longer values win, so a full name is not split into a shorter hit. */
export function coversFor(words: WordBox[], mapping: MaskMapping): LabelCover[] {
  const covers: LabelCover[] = [];
  const used = new Array<boolean>(words.length).fill(false);
  const entries = Object.entries(mapping.labels).sort((left, right) => compact(right[1].original).length - compact(left[1].original).length);
  for (const [token, meta] of entries) {
    const target = compact(meta.original);
    if (target.length < 2) continue;
    for (let start = 0; start < words.length; start += 1) {
      if (used[start]) continue;
      let acc = "";
      for (let end = start; end < words.length && end < start + 12; end += 1) {
        if (used[end]) break;
        acc += compact(words[end]?.text ?? "");
        if (!target.startsWith(acc)) break;
        if (acc !== target) continue;
        const boxes = words.slice(start, end + 1).map((word) => word.box);
        covers.push({ token, box: union(boxes) });
        for (let mark = start; mark <= end; mark += 1) used[mark] = true;
        start = end;
        break;
      }
    }
  }
  return covers;
}

function alignedHits(words: WordBox[], target: string): number {
  let hits = 0;
  for (let start = 0; start < words.length; start += 1) {
    let acc = "";
    for (let end = start; end < words.length && end < start + 12; end += 1) {
      acc += compact(words[end]?.text ?? "");
      if (!target.startsWith(acc)) break;
      if (acc !== target) continue;
      hits += 1;
      start = end;
      break;
    }
  }
  return hits;
}

/** True when every masked value that is readable as whole words on the page has a box to paint. */
export function pageIsCovered(words: WordBox[], mapping: MaskMapping): boolean {
  const covers = coversFor(words, mapping);
  for (const [token, meta] of Object.entries(mapping.labels)) {
    const target = compact(meta.original);
    if (target.length < 2) continue;
    if (covers.filter((cover) => cover.token === token).length < alignedHits(words, target)) return false;
  }
  return true;
}

/** Paints each covered word and writes the mask label on the paint. */
export async function paintPage(image: Buffer, width: number, height: number, words: WordBox[], mapping: MaskMapping): Promise<Buffer> {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(await loadImage(image), 0, 0, width, height);
  for (const cover of coversFor(words, mapping)) {
    const x = Math.max(0, Math.round(cover.box.x * width));
    const y = Math.max(0, Math.round(cover.box.y * height));
    const boxWidth = Math.max(1, Math.round(cover.box.width * width));
    const boxHeight = Math.max(1, Math.round(cover.box.height * height));
    let font = Math.max(12, Math.min(28, Math.round(boxHeight * 0.72)));
    context.font = `bold ${font}px sans-serif`;
    let textWidth = context.measureText(cover.token).width;
    while (font > 10 && textWidth + 8 > width - x) {
      font -= 1;
      context.font = `bold ${font}px sans-serif`;
      textWidth = context.measureText(cover.token).width;
    }
    const paintWidth = Math.min(width - x, Math.max(boxWidth, Math.ceil(textWidth + 8)));
    const paintHeight = Math.min(height - y, Math.max(boxHeight, font + 6));
    context.fillStyle = "#111111";
    context.fillRect(x, y, paintWidth, paintHeight);
    context.fillStyle = "#ffffff";
    context.fillText(cover.token, x + 4, y + Math.min(paintHeight - 4, font));
  }
  return canvas.toBuffer("image/png");
}
