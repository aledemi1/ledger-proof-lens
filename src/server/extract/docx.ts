import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { FlowBlock } from "@/types/audit";
import type { Fragment, ReadDocument } from "../model";

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({ ignoreAttributes: false, preserveOrder: true, trimValues: false });

function nodeName(node: XmlNode): string | null {
  const name = Object.keys(node).find((key) => key !== ":@");
  return name ?? null;
}

function children(node: XmlNode): XmlNode[] {
  const name = nodeName(node);
  if (!name) return [];
  const value = node[name];
  return Array.isArray(value) ? (value as XmlNode[]) : [];
}

function collectText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (typeof node === "object") {
    const record = node as Record<string, unknown>;
    if ("#text" in record && record["#text"] != null) return String(record["#text"]);
    return Object.entries(record)
      .filter(([key]) => key !== ":@")
      .map(([, value]) => collectText(value))
      .join("");
  }
  return "";
}

function findNodes(nodes: XmlNode[], tag: string, out: XmlNode[] = []): XmlNode[] {
  for (const node of nodes) {
    if (nodeName(node) === tag) out.push(node);
    else findNodes(children(node), tag, out);
  }
  return out;
}

export async function extractDocx(buffer: Buffer): Promise<ReadDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("файл повреждён: это не документ DOCX");
  }
  if (zip.file("EncryptionInfo")) throw new Error("файл защищён паролем");
  const xmlFile = zip.file("word/document.xml");
  if (!xmlFile) throw new Error("файл повреждён: нет текста документа");
  const xml = await xmlFile.async("string");
  let tree: XmlNode[];
  try {
    tree = parser.parse(xml) as XmlNode[];
  } catch {
    throw new Error("файл повреждён: текст документа не разбирается");
  }

  const body = findNodes(tree, "w:body");
  const bodyNodes = body.flatMap((node) => children(node));
  const fragments: Fragment[] = [];
  const blocks: FlowBlock[] = [];
  let paragraph = 0;
  let table = 0;

  for (const node of bodyNodes) {
    const name = nodeName(node);
    if (name === "w:p") {
      const text = collectText(node).replace(/\s+/g, " ").trim();
      paragraph += 1;
      if (!text) continue;
      const anchor = `p${paragraph}`;
      fragments.push({
        id: anchor,
        text,
        pageNumber: 0,
        locationLabel: `Абзац ${paragraph}`,
        anchor,
        shape: "line",
      });
      blocks.push({ kind: "paragraph", anchor, text });
    } else if (name === "w:tbl") {
      table += 1;
      const tableRows = findNodes(children(node), "w:tr");
      const rows: { cells: { anchor: string; text: string }[] }[] = [];
      const headerCells = tableRows[0] ? findNodes(children(tableRows[0]), "w:tc").map((cell) => collectText(cell).replace(/\s+/g, " ").trim()) : [];
      tableRows.forEach((rowNode, rowIndex) => {
        const cells = findNodes(children(rowNode), "w:tc");
        const previewCells: { anchor: string; text: string }[] = [];
        cells.forEach((cellNode, colIndex) => {
          const text = collectText(cellNode).replace(/\s+/g, " ").trim();
          if (!text) return;
          const anchor = `t${table}r${rowIndex + 1}c${colIndex + 1}`;
          const header = headerCells[colIndex] ?? "";
          const item = cells.map((cell) => collectText(cell).replace(/\s+/g, " ").trim()).find((value, index) => index === 0 && rowIndex > 0) ?? "";
          const fragment: Fragment = {
            id: anchor,
            text,
            pageNumber: 0,
            locationLabel: `Таблица ${table}, строка ${rowIndex + 1}${header ? `, столбец «${header}»` : ""}`,
            anchor,
            shape: rowIndex === 0 ? "title" : "table",
          };
          if (rowIndex > 0 && header) fragment.columnHeader = header;
          if (rowIndex > 0 && item && colIndex > 0) fragment.rowLabel = item;
          if (/^ед\.?$/i.test(header)) fragment.shape = "title";
          fragments.push(fragment);
          previewCells.push({ anchor, text });
        });
        if (previewCells.length) rows.push({ cells: previewCells });
      });
      blocks.push({ kind: "table", rows });
    }
  }

  if (!fragments.length) throw new Error("не удалось выделить текст: документ пустой");
  return {
    fragments,
    preview: { kind: "flow", blocks },
    pageCount: 0,
    text: fragments.map((fragment) => fragment.text).join("\n"),
    warnings: [],
  };
}
