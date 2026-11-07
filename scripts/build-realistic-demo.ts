/**
 * Builds a fictional multi-page document pack with gpt-6, reconciles it and
 * writes the demo snapshot. The API key is read from the environment only.
 *
 *   bun scripts/build-realistic-demo.ts
 *   set SVERKO_REGENERATE=1 to ask the model again instead of using the cache.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import JSZip from "jszip";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import * as XLSX from "xlsx";
import { readFile } from "../src/server/extract/index";
import { classifyLabels } from "../src/server/llm";
import { reconcile, unknownLabels, type PreparedDoc } from "../src/server/reconcile";
import { computeRecommendation } from "../src/lib/conclusion";
import { loadEnv } from "../src/server/env";
import type { AuditDocument, AuditSession, DocumentType } from "../src/types/audit";

const MODEL = "gpt-6-sol";
const MAX_TOKENS = 32_000;
const CACHE = path.resolve("scripts/.cache/realistic-pack.json");
const OUT_DIR = path.resolve("public/demo");

const SELLER = "ООО «Балтийский контур»";
const BUYER = "АО «Невская лаборатория»";
const ITEM = "Коммутатор Cisco Catalyst C9300-48P";
const CONTRACT = "148/СН-2026";
const SELLER_INN = inn10("781145209");
const BUYER_INN = inn10("780287641");

interface Pack {
  contractParagraphs: string[];
  approval: string[][];
  contacts: string[][];
  actNarrative: string[];
  serials: string[];
  commission: string[];
  invoiceNotes: string[];
  bankNarrative: string[];
}

function inn10(base9: string): string {
  const weights = [2, 4, 10, 3, 5, 9, 4, 6, 8];
  const sum = base9.split("").reduce((acc, digit, index) => acc + Number(digit) * (weights[index] ?? 0), 0);
  return base9 + String((sum % 11) % 10);
}

async function main(): Promise<void> {
  loadEnv();
  const key = process.env["AI_API_KEY"]?.trim();
  const base = (process.env["AI_BASE_URL"] || "https://4sapi.com/v1").replace(/\/$/, "");
  if (!key) throw new Error("Нет AI_API_KEY");
  const pack = await loadPack(base, key);
  const files = await render(pack);
  mkdirSync(OUT_DIR, { recursive: true });
  for (const file of files) writeFileSync(path.join(OUT_DIR, file.name), file.buffer);

  const prepared: PreparedDoc[] = [];
  for (const file of files) {
    const read = await readFile(file.name, file.buffer);
    prepared.push({
      id: file.id,
      name: file.name,
      sha256: createHash("sha256").update(file.buffer).digest("hex"),
      read,
      isReport: file.role === "report",
    });
  }
  const report = prepared[0];
  if (!report) throw new Error("Нет отчёта");
  const supporting = prepared.slice(1);
  const unknown = unknownLabels(prepared);
  console.log(`Незнакомых подписей: ${unknown.length}`);
  const hints = unknown.length ? await classifyLabels({ baseUrl: base, apiKey: key, model: MODEL }, unknown) : new Map();
  console.log("Подсказки модели:", Object.fromEntries(hints));
  const checks = reconcile(report, supporting, [], hints);
  const documents = prepared.map((doc, index) => toAuditDocument(doc, files[index]!));
  const session: AuditSession = {
    id: "demo-equipment-oct-2026",
    title: "Поставка коммутаторов — октябрь 2026",
    description: `Учебный комплект: ${BUYER} сверяет отчёт с договором, актом, накладной и счётом ${SELLER}. Тексты составлены моделью ${MODEL}, организации вымышлены.`,
    createdAt: "2026-11-02T09:14:00.000Z",
    status: "in_review",
    isDemo: true,
    reportDocumentId: report.id,
    supportingDocumentIds: supporting.map((doc) => doc.id),
    checks,
    recommendation: computeRecommendation(checks),
    reviewerDecision: null,
    notices: [`Подписи, которых не было в словаре правил, классифицировала модель ${MODEL}. Суммы и количества посчитаны кодом.`],
  };
  const snapshot = `import type { AuditDocument, AuditSession } from "@/types/audit";\n\nexport const realisticDocuments = ${JSON.stringify(documents)} as AuditDocument[];\n\nexport const realisticSession = ${JSON.stringify(session)} as AuditSession;\n`;
  writeFileSync(path.resolve("src/mocks/realisticDemo.ts"), snapshot, "utf8");
  console.log("\nПроверки:");
  for (const check of checks) {
    console.log(`  ${check.status.padEnd(12)} ${check.fieldName} | ${check.reportValue} | ${check.sourceValue ?? "—"} | ${check.discrepancy ?? ""}`);
  }
  console.log(`recommendation=${session.recommendation} files=${files.map((file) => file.name).join(", ")}`);
}

async function loadPack(base: string, key: string): Promise<Pack> {
  if (existsSync(CACHE) && process.env["SVERKO_REGENERATE"] !== "1") {
    console.log("Беру тексты из кэша", CACHE);
    return JSON.parse(readFileSync(CACHE, "utf8")) as Pack;
  }
  console.log(`Запрос к ${MODEL}, max_tokens=${MAX_TOKENS}`);
  const shared = [
    "Ты готовишь учебные первичные документы российской компании. Все организации, люди, счета и адреса вымышлены.",
    `Поставщик: ${SELLER}, ИНН ${SELLER_INN}. Покупатель: ${BUYER}, ИНН ${BUYER_INN}.`,
    `Договор поставки № ${CONTRACT} от 12.09.2026, Санкт-Петербург. Предмет: ${ITEM}, цена 161 000 руб. за штуку.`,
    "По заказу 24 штуки на 3 864 000 руб. Фактически 16.10.2026 переданы 22 штуки на 3 542 000 руб. Две штуки в пути, заводские номера остались в спецификации заказа.",
    "Транспорт 47 200 руб. в первичных документах этой поставки не закрыт.",
    "Не начинай абзац с подписи и двоеточия (никаких строк «Количество:», «Сумма:», «ИНН:», «Дата:»). Числа сделки упоминай внутри обычных предложений.",
    "Пиши канцелярским языком: реквизиты, отсылки к ГК РФ, порядок приёмки, неустойка, форс-мажор, претензии, подписи. Добавляй правдоподобные, но бесполезные для сверки подробности.",
    "Ответь одним JSON-объектом без пояснений.",
  ].join("\n");
  const contract = await chatJson(base, key, shared, {
    task: "Текст договора и сопутствующие списки.",
    shape: {
      contractParagraphs: "не меньше 42 абзацев, каждый 450–1100 знаков: преамбула, предмет, качество, комплектность, цена и порядок расчётов, срок и базис поставки, тара, приёмка по количеству и качеству, претензии 10 рабочих дней, переход права и риска, неустойка 0,1% в день, ограничение ответственности, конфиденциальность, антикоррупционная оговорка, форс-мажор, срок договора до 31.12.2026, изменение и расторжение, реквизиты и подписи сторон",
      approval: "18 строк журнала согласования: [сотрудник, должность, отметка, комментарий]. Отметки вроде «согласовано 03.10.2026», без отдельных столбцов-подписей.",
      contacts: "10 строк: [фио, роль на проекте, телефон, почта на вымышленном домене kontur-balt.example]",
    },
  });
  const papers = await chatJson(base, key, shared, {
    task: "Тексты акта, комиссии и счёта.",
    shape: {
      actNarrative: "16–22 предложения о ходе приёмки: место (склад покупателя, ул. Лабораторная, д. 7), комиссия, внешний осмотр, отсутствие повреждений тары, расхождение с заказом на 2 штуки, серийные номера отсутствующих коммутаторов, решение принять 22 штуки и направить претензию по недопоставке. Каждое предложение — отдельная строка массива.",
      serials: "ровно 22 вымышленных заводских номера вида FCW2648A0xx и краткая отметка «установлен в стойку / ЗИП»",
      commission: "12–16 строк протокола комиссии: кто присутствовал, что сверили с договором и спецификацией, особое мнение кладовщика о двух не прибывших местах, решение. Каждая строка — отдельный элемент массива.",
      invoiceNotes: "8–12 строк условий счёта: срок оплаты 5 банковских дней, назначение платежа прозой, НДС 20% внутри суммы, предупреждение что счёт выставлен по фактически переданному количеству.",
      bankNarrative: "8–12 строк вымышленных банковских реквизитов поставщика и назначения платежа, плюс перечисление приложений к счёту.",
    },
  });
  const pack: Pack = {
    contractParagraphs: strings(contract["contractParagraphs"], 8),
    approval: rows(contract["approval"]),
    contacts: rows(contract["contacts"]),
    actNarrative: strings(papers["actNarrative"], 6),
    serials: strings(papers["serials"], 8),
    commission: strings(papers["commission"], 6),
    invoiceNotes: strings(papers["invoiceNotes"], 4),
    bankNarrative: strings(papers["bankNarrative"], 4),
  };
  mkdirSync(path.dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(pack, null, 2), "utf8");
  return pack;
}

async function chatJson(base: string, key: string, system: string, data: unknown): Promise<Record<string, unknown>> {
  const messages = [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(data) },
  ];
  let response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(180_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, temperature: 0.4, max_tokens: MAX_TOKENS, response_format: { type: "json_object" }, messages }),
  });
  if (response.status === 400 && /temperature/i.test(await response.clone().text())) {
    response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(180_000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, response_format: { type: "json_object" }, messages }),
    });
  }
  if (!response.ok) throw new Error(`${MODEL} ответила ${response.status}: ${(await response.text()).slice(0, 400)}`);
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[]; usage?: unknown };
  console.log("usage", JSON.stringify(payload.usage));
  const content = payload.choices?.[0]?.message?.content ?? "";
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("В ответе нет JSON");
  return JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
}

function strings(value: unknown, min: number): string[] {
  const list = Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
  if (list.length < min) throw new Error(`Модель вернула слишком короткий список (${list.length} < ${min})`);
  return list.map(stripLabelLine);
}

function rows(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map((cell) => stripLabelLine(String(cell))));
}

/** Drops a leading "Подпись: значение", so prose does not become an extra fact. */
function stripLabelLine(text: string): string {
  return text.replace(/^[^:\n]{2,40}:\s+/, "").replace(/\s+/g, " ").trim();
}

interface OutFile {
  id: string;
  name: string;
  role: "report" | "supporting";
  type: DocumentType;
  buffer: Buffer;
}

async function render(pack: Pack): Promise<OutFile[]> {
  return [
    { id: "doc-report", name: "Отчет_поставка_октябрь_2026.xlsx", role: "report", type: "report", buffer: reportBook(pack) },
    { id: "doc-contract", name: "Договор_148-СН-2026.docx", role: "supporting", type: "contract", buffer: await contractDocx(pack) },
    { id: "doc-act", name: "Акт_27.pdf", role: "supporting", type: "act", buffer: await actPdf(pack) },
    { id: "doc-waybill", name: "Накладная_611.xlsx", role: "supporting", type: "waybill", buffer: waybillBook(pack) },
    { id: "doc-invoice", name: "Счет_903.pdf", role: "supporting", type: "invoice", buffer: await invoicePdf(pack) },
  ];
}

function reportBook(_pack: Pack): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["Отчёт о поставке сетевого оборудования за октябрь 2026 года"],
    ["Подразделение", "Отдел материально-технического обеспечения"],
    ["Показатель", "Значение"],
    ["Номер договора", CONTRACT],
    ["Поставщик", SELLER],
    ["ИНН поставщика", SELLER_INN],
    ["Наименование оборудования", ITEM],
    ["Количество", "24 шт"],
    ["Стоимость поставки", "3 864 000,00 ₽"],
    ["Транспортные расходы", "47 200,00 ₽"],
    ["Дата передачи", "16.10.2026"],
    ["Принято на склад", "24 шт"],
    ["К оплате по счёту", "3 911 200,00 ₽"],
    [],
    ["Составил", "Гордеева Марина Сергеевна, ведущий бухгалтер"],
    ["Проверил", "Лосев Игорь Павлович, начальник ОМТО"],
    ["Примечание", "В отчёте указан полный объём заказа. Первичные документы на дату отчёта закрывают только прибывшую партию."],
  ]), "Сводка");
  return Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Uint8Array);
}

function waybillBook(pack: Pack): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["Товарная накладная № 611"],
    ["Склад отгрузки", "Санкт-Петербург, наб. Обводного канала, д. 14"],
    ["Склад приемки", "Санкт-Петербург, ул. Лабораторная, д. 7"],
    ["Договор", CONTRACT],
    ["Дата отгрузки", "16.10.2026"],
    ["Основание", `договор поставки № ${CONTRACT} от 12.09.2026, спецификация № 1`],
    [],
    ["Наименование", "Кол-во", "Ед.", "Цена", "Сумма"],
    [ITEM, "22 шт", "шт", "161 000,00", "3 542 000,00"],
  ]), "Накладная");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["Место", "Заводской номер", "Состояние тары", "Куда определён"],
    ...pack.serials.map((serial, index) => [`${index + 1}`, serial, "без повреждений", index < 18 ? "стойка А" : "ЗИП"]),
  ]), "Упаковочный лист");
  return Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Uint8Array);
}

async function contractDocx(pack: Pack): Promise<Buffer> {
  const paragraphs = [
    `ДОГОВОР ПОСТАВКИ № ${CONTRACT}`,
    "г. Санкт-Петербург",
    "12 сентября 2026 г.",
    `${SELLER} и ${BUYER} заключили договор о нижеследующем.`,
    `Поставщик: ${SELLER}`,
    `ИНН: ${SELLER_INN}`,
    `Номер договора: ${CONTRACT}`,
    `Наименование оборудования: ${ITEM}`,
    ...pack.contractParagraphs,
    "ЖУРНАЛ СОГЛАСОВАНИЯ",
    ...pack.approval.map((row) => row.join(", ")),
    "КОНТАКТЫ РАБОЧЕЙ ГРУППЫ",
    ...pack.contacts.map((row) => row.join(", ")),
    "РЕКВИЗИТЫ И ПОДПИСИ СТОРОН",
    `${SELLER}, регистрационный номер ${SELLER_INN}, КПП 781101001, 190000, г. Санкт-Петербург, наб. Обводного канала, д. 14, лит. А, офис 612.`,
    `${BUYER}, регистрационный номер ${BUYER_INN}, КПП 780201001, 199106, г. Санкт-Петербург, ул. Лабораторная, д. 7.`,
  ];
  return docx(paragraphs);
}

async function docx(paragraphs: string[]): Promise<Buffer> {
  const body = paragraphs
    .map((text) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`)
    .join("");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

async function actPdf(pack: Pack): Promise<Buffer> {
  const pages = [
    [
      `АКТ ПРИЁМА-ПЕРЕДАЧИ № 27`,
      `к договору поставки № ${CONTRACT} от 12.09.2026`,
      `${SELLER} передал, а ${BUYER} принял следующее оборудование.`,
      `Договор № ${CONTRACT}`,
      `Поставщик: ${SELLER}`,
      `ИНН: ${SELLER_INN}`,
      `Наименование: ${ITEM}`,
      "Количество: 22 шт",
      "Принято на склад: 22 шт",
      "Стоимость поставки: 3 542 000,00 руб.",
      "Начислено к оплате: 3 542 000,00 руб.",
      "Дата передачи: 16.10.2026",
      ...pack.actNarrative,
    ],
    ["ПРИЛОЖЕНИЕ. ЗАВОДСКИЕ НОМЕРА ПРИНЯТЫХ КОММУТАТОРОВ", ...pack.serials.map((serial, index) => `${index + 1}. ${serial}`)],
    ["ПРОТОКОЛ КОМИССИИ", ...pack.commission, "Подписи: председатель комиссии Лосев И. П., члены комиссии Гордеева М. С. и кладовщик Ершов К. А."],
  ];
  return linesPdf(pages);
}

async function invoicePdf(pack: Pack): Promise<Buffer> {
  return linesPdf([
    [
      "СЧЁТ НА ОПЛАТУ № 903 от 16.10.2026",
      `Поставщик: ${SELLER}`,
      `ИНН: ${SELLER_INN}`,
      `Плательщик ${BUYER}, регистрационный номер ${BUYER_INN}.`,
      `Договор № ${CONTRACT}`,
      `Наименование: ${ITEM}`,
      "Количество: 22 шт",
      "Всего к оплате: 3 542 000,00 руб.",
      "Дата: 16.10.2026",
      "В том числе НДС 20%: 590 333,33 руб.",
      ...pack.invoiceNotes,
    ],
    ["ПЛАТЁЖНЫЕ РЕКВИЗИТЫ И ПРИЛОЖЕНИЯ", ...pack.bankNarrative],
  ]);
}

async function linesPdf(pages: string[][]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(readFileSync("C:/Windows/Fonts/arial.ttf"));
  const bold = await pdf.embedFont(readFileSync("C:/Windows/Fonts/arialbd.ttf"));
  const fixed = new Date("2026-10-16T00:00:00Z");
  pdf.setCreationDate(fixed);
  pdf.setModificationDate(fixed);
  pages.forEach((lines, index) => drawPage(pdf, font, bold, lines, index + 1, pages.length));
  return Buffer.from(await pdf.save());
}

function drawPage(pdf: PDFDocument, font: PDFFont, bold: PDFFont, lines: string[], pageNumber: number, pageCount: number): void {
  const page = pdf.addPage([595.28, 841.89]);
  page.drawRectangle({ x: 0, y: 812, width: 595.28, height: 30, color: rgb(0.93, 0.95, 0.97) });
  page.drawText(clean(`Стр. ${pageNumber} из ${pageCount}`), { x: 500, y: 822, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
  let y = 786;
  lines.forEach((raw, index) => {
    const text = clean(raw);
    const size = index === 0 ? 13 : 11;
    const face = index === 0 ? bold : font;
    for (const piece of wrap(text, face, size, 500)) {
      if (y < 56) return;
      page.drawText(piece, { x: 48, y, size, font: face, color: rgb(0.1, 0.1, 0.1) });
      y -= size + 7;
    }
    y -= 4;
  });
  void (page as PDFPage);
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function clean(text: string): string {
  return text.replace(/[^\u0000-\u007E\u00A0\u0400-\u04FF«»№—–]/g, "");
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toAuditDocument(doc: PreparedDoc, file: OutFile): AuditDocument {
  const preview = doc.read.preview.kind === "pdf"
    ? { kind: "pdf" as const, url: `/demo/${encodeURIComponent(file.name)}`, pageCount: doc.read.pageCount }
    : doc.read.preview;
  return {
    id: doc.id,
    name: doc.name,
    type: file.type,
    mimeType: file.name.endsWith(".pdf")
      ? "application/pdf"
      : file.name.endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: file.buffer.length,
    pageCount: doc.read.pageCount,
    preview,
  };
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
