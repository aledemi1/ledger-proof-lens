import JSZip from "jszip";
import * as XLSX from "xlsx";
import { readGrid, type SheetCell } from "../sheet";
import type { ReadDocument } from "../model";

function cellText(cell: XLSX.CellObject): { text: string; formulaMissing: boolean } {
  const formula = typeof cell.f === "string" ? cell.f : "";
  if (formula && (cell.v == null || cell.v === "")) return { text: "", formulaMissing: true };
  if (cell.v == null || cell.v === "") return { text: "", formulaMissing: false };
  const formatted = typeof cell.w === "string" && cell.w.trim() ? cell.w.trim() : String(cell.v).trim();
  return { text: formatted, formulaMissing: false };
}

export async function extractSpreadsheet(buffer: Buffer): Promise<ReadDocument> {
  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(buffer, { type: "buffer", cellDates: false, cellFormula: true, cellNF: true, cellStyles: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "файл не читается";
    if (/password|encrypt/i.test(message)) throw new Error("файл защищён паролем");
    throw new Error(`файл повреждён (${message})`);
  }
  if (!book.SheetNames.length) throw new Error("в книге нет листов");

  const fragments = [];
  const sheets = [];
  for (let s = 0; s < book.SheetNames.length; s += 1) {
    const name = book.SheetNames[s] ?? `Лист ${s + 1}`;
    const sheet = book.Sheets[name];
    if (!sheet) continue;
    const cells: SheetCell[] = [];
    const ref = sheet["!ref"];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      for (let r = range.s.r; r <= range.e.r; r += 1) {
        for (let c = range.s.c; c <= range.e.c; c += 1) {
          const address = XLSX.utils.encode_cell({ r, c });
          const cell = sheet[address] as XLSX.CellObject | undefined;
          if (!cell) continue;
          const parsed = cellText(cell);
          if (!parsed.text && !parsed.formulaMissing) continue;
          cells.push({ row: r + 1, col: c + 1, address, text: parsed.text, formulaMissing: parsed.formulaMissing });
        }
      }
    }
    for (const address of (await formulaCellsWithoutValue(buffer)).get(name) ?? []) {
      if (cells.some((cell) => cell.address === address)) continue;
      const decoded = XLSX.utils.decode_cell(address);
      cells.push({ row: decoded.r + 1, col: decoded.c + 1, address, text: "", formulaMissing: true });
    }
    const grid = readGrid(name, cells, s);
    fragments.push(...grid.fragments);
    sheets.push({ name, rows: grid.rows });
  }

  return {
    fragments,
    preview: { kind: "grid", sheets },
    pageCount: Math.max(1, sheets.length),
    text: fragments.map((fragment) => fragment.text).join("\n"),
    warnings: [],
  };
}

export function extractCsv(buffer: Buffer): ReadDocument {
  const source = buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (!source.trim()) throw new Error("файл пустой");
  const comma = (source.match(/,/g) ?? []).length;
  const semi = (source.match(/;/g) ?? []).length;
  const rows = parseDelimited(source, semi > comma ? ";" : ",");
  const cells: SheetCell[] = [];
  rows.forEach((row, r) => {
    row.forEach((value, c) => {
      const text = value.trim();
      if (!text) return;
      cells.push({
        row: r + 1,
        col: c + 1,
        address: XLSX.utils.encode_cell({ r, c }),
        text,
        formulaMissing: false,
      });
    });
  });
  const grid = readGrid("CSV", cells, 0);
  return {
    fragments: grid.fragments,
    preview: { kind: "grid", sheets: [{ name: "CSV", rows: grid.rows }] },
    pageCount: 1,
    text: grid.fragments.map((fragment) => fragment.text).join("\n"),
    warnings: [],
  };
}

async function formulaCellsWithoutValue(buffer: Buffer): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  try {
    const zip = await JSZip.loadAsync(buffer);
    const workbook = await zip.file("xl/workbook.xml")?.async("string");
    const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
    if (!workbook || !rels) return found;
    const names = [...workbook.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)];
    for (const sheet of names) {
      const name = sheet[1];
      const id = sheet[2];
      if (!name || !id) continue;
      const target = rels.match(new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`))?.[1];
      if (!target) continue;
      const xml = await zip.file(`xl/${target.replace(/^\//, "")}`)?.async("string");
      if (!xml) continue;
      const addresses: string[] = [];
      for (const cell of xml.matchAll(/<c\b[^>]*>[\s\S]*?<\/c>/g)) {
        const body = cell[0];
        const address = body.match(/\br="([A-Z]+\d+)"/)?.[1];
        if (address && body.includes("<f") && !body.includes("<v")) addresses.push(address);
      }
      if (addresses.length) found.set(name, addresses);
    }
  } catch {
    return found;
  }
  return found;
}

function parseDelimited(source: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i] ?? "";
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
