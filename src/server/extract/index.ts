import type { ReadDocument } from "../model";
import { extractDocx } from "./docx";
import { extractImage } from "./image";
import { extractPdf } from "./pdf";
import { extractCsv, extractSpreadsheet } from "./xlsx";

const REPORT = new Set(["pdf", "xlsx", "xls", "csv", "docx"]);
const SUPPORT = new Set(["pdf", "xlsx", "xls", "csv", "docx", "jpg", "jpeg", "png"]);
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function validateFile(name: string, buffer: Buffer, role: "report" | "supporting"): string | null {
  const ext = fileExtension(name);
  const allowed = role === "report" ? REPORT : SUPPORT;
  if (!allowed.has(ext)) {
    return role === "report"
      ? `формат не поддерживается для отчёта. Допустимы PDF, XLSX, XLS, CSV и DOCX`
      : `формат не поддерживается. Допустимы PDF, XLSX, XLS, CSV, DOCX, JPG и PNG`;
  }
  if (!buffer.length) return "файл пустой";
  if (buffer.length > MAX_UPLOAD_BYTES) return "размер больше 25 МБ";
  const kind = sniff(buffer);
  if (ext === "pdf" && kind !== "pdf") return "содержимое не является PDF";
  if ((ext === "xlsx" || ext === "docx") && kind !== "zip") return "содержимое не соответствует расширению: файл повреждён или защищён";
  if (ext === "xls" && kind !== "ole") return "содержимое не является книгой XLS";
  if ((ext === "jpg" || ext === "jpeg") && kind !== "jpeg") return "содержимое не является изображением JPEG";
  if (ext === "png" && kind !== "png") return "содержимое не является изображением PNG";
  if (ext === "csv" && (kind === "pdf" || kind === "zip" || kind === "jpeg" || kind === "png" || kind === "ole")) {
    return "содержимое не является CSV";
  }
  return null;
}

function sniff(buffer: Buffer): string {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) return "zip";
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.length >= 4 && buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) return "ole";
  return "text";
}

export async function readFile(name: string, buffer: Buffer): Promise<ReadDocument> {
  const ext = fileExtension(name);
  if (ext === "xlsx" || ext === "xls") return extractSpreadsheet(buffer);
  if (ext === "csv") return extractCsv(buffer);
  if (ext === "docx") return extractDocx(buffer);
  if (ext === "pdf") return extractPdf(buffer);
  if (ext === "jpg" || ext === "jpeg" || ext === "png") return extractImage(buffer);
  throw new Error("формат не поддерживается");
}
