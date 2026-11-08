import type { ReadDocument } from "../model";
import { ocrUnavailableReason, recognizeImage } from "./ocr";

export async function extractImage(buffer: Buffer): Promise<ReadDocument> {
  let width = 0;
  let height = 0;
  try {
    const { loadImage } = await import("@napi-rs/canvas");
    const image = await loadImage(buffer);
    width = image.width;
    height = image.height;
  } catch {
    throw new Error("файл повреждён: изображение не открывается");
  }
  const mime = buffer[0] === 0xff && buffer[1] === 0xd8 ? "image/jpeg" : "image/png";
  let recognized;
  try {
    recognized = await recognizeImage(buffer, width, height, mime);
  } catch (error) {
    throw new Error(ocrUnavailableReason(error));
  }
  if (!recognized.lines.length) throw new Error("на изображении не удалось распознать текст");
  const fragments = recognized.lines.map((line, index) => ({
    id: `i${index + 1}`,
    text: line.text,
    pageNumber: 1,
    locationLabel: "Скан",
    anchor: `i${index + 1}`,
    shape: "line" as const,
    ...(line.box ? { box: line.box } : {}),
    ...(line.tokens ? { tokens: line.tokens } : {}),
  }));
  return {
    fragments,
    preview: { kind: "image", width, height },
    pageCount: 1,
    text: fragments.map((fragment) => fragment.text).join("\n"),
    warnings: recognized.engine === "model" ? ["Текст распознан запасным OCR. Координаты строк не размечены, потому что запасной способ возвращает только текст."] : [],
  };
}
