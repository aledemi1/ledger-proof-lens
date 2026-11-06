import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as XLSX from "xlsx";

const fontCandidates = ["C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf"];

export function fontPath(): string {
  const found = fontCandidates.find((item) => existsSync(item));
  if (!found) throw new Error("Не найден шрифт Arial или Segoe UI для синтетических PDF");
  return found;
}

export function supplyReport(): Buffer {
  return sheet("Отчёт", [
    ["Показатель", "Значение"],
    ["Номер договора", "21-2026"],
    ["Поставщик", "ООО «Север Снаб»"],
    ["ИНН поставщика", "7701234567"],
    ["Наименование оборудования", "Сервер Dell PowerEdge"],
    ["Количество", "50 шт"],
    ["Стоимость поставки", "280 000,00 ₽"],
    ["Транспортные расходы", "12 000,00 ₽"],
    ["Дата передачи", "14.10.2026"],
  ]);
}

export function waybill(number: string, qty: number): Buffer {
  return sheet("Накладная", [
    [`Товарная накладная № ${number}`],
    ["Договор", "21-2026"],
    ["Дата отгрузки", number === "34" ? "21.10.2026" : "14.10.2026"],
    [],
    ["Наименование", "Кол-во", "Ед."],
    ["Сервер Dell PowerEdge", qty, "шт"],
  ]);
}

export function scanReport(): Buffer {
  return sheet("Отчёт", [
    ["Показатель", "Значение"],
    ["Стоимость работ", "18 500,00 руб."],
  ]);
}

export function docxReport(): Buffer {
  return sheet("Отчёт", [
    ["Показатель", "Значение"],
    ["Наименование", "Бумага офисная"],
    ["Количество", "10 шт"],
  ]);
}

export async function formulaReport(): Promise<Buffer> {
  const sheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>Показатель</t></is></c>
      <c r="B1" t="inlineStr"><is><t>Значение</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>Стоимость поставки</t></is></c>
      <c r="B2"><f>1+1</f></c>
    </row>
  </sheetData>
</worksheet>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Отчёт" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", sheet);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

export function tableFile(name: string, rows: (string | number | undefined)[][]): Buffer {
  return sheet(name, rows);
}

function sheet(name: string, rows: (string | number | undefined)[][]): Buffer {
  const book = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(book, ws, name);
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function actPdf(amount: string | null, onPage: 1 | 2): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(readFileSync(fontPath()));
  const fixed = new Date("2026-01-01T00:00:00Z");
  pdf.setCreationDate(fixed);
  pdf.setModificationDate(fixed);
  const paint = (page: ReturnType<PDFDocument["addPage"]>, lines: string[]) => {
    let y = 780;
    for (const line of lines) {
      page.drawText(line, { x: 48, y, size: 14, font, color: rgb(0, 0, 0) });
      y -= 32;
    }
  };
  const body = [
    "АКТ № 14",
    "Договор № 21-2026",
    "Поставщик: ООО «Север Снаб»",
    "Наименование: Сервер Dell PowerEdge",
    ...(amount ? [`Стоимость поставки: ${amount}`] : []),
    "Дата передачи: 14.10.2026",
  ];
  if (onPage === 1) paint(pdf.addPage([595.28, 841.89]), body);
  else {
    paint(pdf.addPage([595.28, 841.89]), ["АКТ № 14", "Сведения о сумме перенесены на следующую страницу."]);
    paint(pdf.addPage([595.28, 841.89]), body);
  }
  return Buffer.from(await pdf.save());
}

export async function rentPaymentPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(readFileSync(fontPath()));
  const page = pdf.addPage([595.28, 841.89]);
  const lines = ["ПЛАТЕЖНОЕ ПОРУЧЕНИЕ № 9", "Назначение платежа: аренда офиса", "Сумма: 45 000,00 руб."];
  let y = 780;
  for (const line of lines) {
    page.drawText(line, { x: 48, y, size: 14, font, color: rgb(0, 0, 0) });
    y -= 32;
  }
  return Buffer.from(await pdf.save());
}

export async function contractDocx(): Promise<Buffer> {
  const paragraphs = ["ДОГОВОР № 21-2026", "Поставщик: ООО «Север Снаб»", "ИНН: 7701234567", "Предмет: поставка оборудования"];
  return docxFrom(paragraphs, []);
}

export async function paperDocx(): Promise<Buffer> {
  return docxFrom(
    ["Счет на бумагу"],
    [
      ["Наименование", "Кол-во", "Ед."],
      ["Бумага офисная", "10", "шт"],
    ],
  );
}

async function docxFrom(paragraphs: string[], table: string[][]): Promise<Buffer> {
  const body = [
    ...paragraphs.map((text) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`),
    table.length
      ? `<w:tbl>${table
          .map(
            (row) =>
              `<w:tr>${row
                .map((cell) => `<w:tc><w:p><w:r><w:t xml:space="preserve">${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`)
                .join("")}</w:tr>`,
          )
          .join("")}</w:tbl>`
      : "",
  ].join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", documentXml);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function scanPng(): Promise<Buffer> {
  const { createCanvas, GlobalFonts } = await import("@napi-rs/canvas");
  GlobalFonts.registerFromPath(fontPath(), "FixtureSans");
  const canvas = createCanvas(1600, 900);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1600, 900);
  ctx.fillStyle = "#111111";
  ctx.font = "54px FixtureSans";
  ["АКТ № 15", "Выполненные работы", "Стоимость работ: 18 500,00 руб."].forEach((line, index) => {
    ctx.fillText(line, 80, 160 + index * 110);
  });
  return canvas.toBuffer("image/png");
}

export function brokenPdf(): Buffer {
  return Buffer.from("%PDF-1.4\ntruncated");
}

export async function writeAcceptanceFixtures(dir = path.resolve("fixtures/acceptance")): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const files: [string, Buffer][] = [
    ["Отчет_поставка.xlsx", supplyReport()],
    ["Накладная_34.xlsx", waybill("34", 47)],
    ["Накладная_33.xlsx", waybill("33", 30)],
    ["Накладная_34_часть.xlsx", waybill("35", 17)],
    ["Договор_21-2026.docx", await contractDocx()],
    ["Акт_14.pdf", await actPdf("250 000,00 руб.", 1)],
    ["Акт_14_стр2.pdf", await actPdf("280 000,00 руб.", 2)],
    ["Платеж_аренда.pdf", await rentPaymentPdf()],
    ["Отчет_работы.xlsx", scanReport()],
    ["Акт_15_скан.png", await scanPng()],
    ["Отчет_бумага.xlsx", docxReport()],
    ["Счет_бумага.docx", await paperDocx()],
    ["Поврежденный.pdf", brokenPdf()],
    ["Отчет_формула.xlsx", await formulaReport()],
  ];
  for (const [name, buffer] of files) writeFileSync(path.join(dir, name), buffer);
}
