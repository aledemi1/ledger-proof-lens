import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "../src/server/extract/index";

const VAT: Record<string, string> = {
  en: "VAT",
  de: "MwSt",
  fr: "TVA",
  it: "IVA",
  es: "IVA",
  tr: "KDV",
  pl: "VAT",
  pt: "IVA",
  nl: "BTW",
  zh: "增值税",
};

function replaceVat(value: string, term: string): string {
  return value
    .replace(/(?<![А-Яа-яЁё])НДС(?![А-Яа-яЁё])/gu, term)
    .replace(/NДС/g, term)
    .replace(/(?<![A-Za-z])NDS(?![A-Za-z])/g, term);
}

function replaceXlsx(buffer: Buffer, term: string): Buffer {
  const book = XLSX.read(buffer, { type: "buffer", cellStyles: true, cellNF: true });
  for (const sheet of Object.values(book.Sheets)) {
    if (!sheet) continue;
    for (const key of Object.keys(sheet)) {
      if (key.startsWith("!")) continue;
      const cell = sheet[key] as { t?: string; v?: unknown; w?: unknown };
      if (typeof cell?.v === "string" && /НДС|NDS|NДС/.test(cell.v)) cell.v = replaceVat(cell.v, term);
      if (typeof cell?.w === "string" && /НДС|NDS|NДС/.test(cell.w)) cell.w = replaceVat(cell.w, term);
    }
  }
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function replaceDocx(buffer: Buffer, term: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith("word/") || !name.endsWith(".xml")) continue;
    const xml = await zip.file(name)?.async("string");
    if (!xml || !/НДС|NDS|NДС/.test(xml)) continue;
    zip.file(name, replaceVat(xml, term));
  }
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

async function replacePdf(name: string, buffer: Buffer, term: string, font: Buffer): Promise<Buffer> {
  const read = await readFile(name, buffer);
  const lines = read.fragments.map((fragment) => replaceVat(fragment.text, term)).filter((line) => line.trim());
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const embedded = await pdf.embedFont(font, { subset: true });
  let page = pdf.addPage([595, 842]);
  let y = 800;
  for (const line of lines) {
    const text = line.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (y < 48) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    page.drawText(text.slice(0, 180), { x: 40, y, size: 10, font: embedded, color: rgb(0.1, 0.1, 0.12) });
    y -= 14;
  }
  return Buffer.from(await pdf.save());
}

const latin = readFileSync(path.resolve("scripts/.cache/fonts/NotoSans-Regular.ttf"));
const cjk = readFileSync(path.resolve("scripts/.cache/fonts/NotoSansSC-Regular.otf"));
const root = path.resolve("public/demo/lab");

for (const [locale, term] of Object.entries(VAT)) {
  const folder = path.join(root, locale);
  let changed = 0;
  for (const name of readdirSync(folder)) {
    const file = path.join(folder, name);
    if (!statSync(file).isFile()) continue;
    const buffer = readFileSync(file);
    const ext = path.extname(name).toLowerCase();
    const latinVat = buffer.includes(Buffer.from("NDS")) || buffer.includes(Buffer.from("NДС"));
    const cyrillicVat = buffer.includes(Buffer.from("НДС"));
    if (!latinVat && !cyrillicVat) continue;
    if (ext === ".xlsx") writeFileSync(file, replaceXlsx(buffer, term));
    else if (ext === ".docx") writeFileSync(file, await replaceDocx(buffer, term));
    else if (ext === ".pdf") writeFileSync(file, await replacePdf(name, buffer, term, locale === "zh" ? cjk : latin));
    else continue;
    changed += 1;
  }
  console.log(locale, term, changed);
}
