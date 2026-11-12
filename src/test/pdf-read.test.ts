// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { readFile } from "@/server/extract";
import { setPrimaryOcrForTests } from "@/server/extract/ocr";
import { actPdf, fontPath } from "@/server/fixtures";

afterEach(() => {
  setPrimaryOcrForTests(null);
});

async function linesPdf(lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(readFileSync(fontPath()));
  const page = pdf.addPage([595.28, 841.89]);
  let y = 780;
  for (const line of lines) {
    page.drawText(line, { x: 48, y, size: 14, font, color: rgb(0, 0, 0) });
    y -= 28;
  }
  return Buffer.from(await pdf.save());
}

describe("pdf reading", () => {
  it("uses the text layer when recognition finds nothing, and joins a wrapped line", async () => {
    setPrimaryOcrForTests(async () => []);
    const doc = await readFile("wrap.pdf", await linesPdf([
      "Сумма составляет",
      "250 000 рублей.",
      "Акт завершён.",
      "Подпись директора",
      "Разделы списка",
      "1. Сервер",
      "Поставка «Сервер",
      "Power готова.",
    ]));
    const texts = doc.fragments.map((fragment) => fragment.text);
    expect(texts.some((text) => text.includes("Сумма составляет 250 000"))).toBe(true);
    expect(texts.some((text) => text.includes("Акт завершён.") && text.includes("Подпись"))).toBe(false);
    expect(texts.some((text) => text.includes("1. Сервер") && text.includes("Разделы"))).toBe(false);
    expect(texts.some((text) => text.includes("Поставка «Сервер Power"))).toBe(true);
    expect(doc.warnings.some((warning) => warning.includes("текстовый слой"))).toBe(true);
    expect(doc.pages).toBeUndefined();
    expect(doc.fragments.every((fragment) => fragment.box)).toBe(true);
  });

  it("keeps a recognized page and falls back only on the page recognition missed", async () => {
    let page = 0;
    setPrimaryOcrForTests(async () => {
      page += 1;
      if (page === 1) return [{ text: "без рамки" }];
      return [];
    });
    const doc = await readFile("two.pdf", await actPdf("250 000,00 руб.", 2));
    expect(doc.fragments.some((fragment) => fragment.text === "без рамки" && fragment.box == null)).toBe(true);
    expect(doc.fragments.some((fragment) => fragment.pageNumber === 2 && fragment.text.includes("Договор"))).toBe(true);
    expect(doc.pages).toHaveLength(1);
    expect(doc.warnings.some((warning) => warning.includes("Страница 2"))).toBe(true);
  });

  it("falls back to the text layer when recognition fails", async () => {
    setPrimaryOcrForTests(async () => {
      throw new Error("tess missing");
    });
    const doc = await readFile("act.pdf", await actPdf("250 000,00 руб.", 1));
    expect(doc.text).toContain("Договор");
    expect(doc.warnings.some((warning) => warning.includes("OCR недоступен"))).toBe(true);
  });

  it("rejects a damaged file and a page with no text at all", async () => {
    await expect(readFile("bad.pdf", Buffer.from("%PDF-1.4\nnot a pdf"))).rejects.toThrow(/повреждён/);
    setPrimaryOcrForTests(async () => []);
    const blank = await PDFDocument.create();
    blank.addPage([200, 200]);
    await expect(readFile("blank.pdf", Buffer.from(await blank.save()))).rejects.toThrow(/не нашло текста/);
  });
});
