import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readFile } from "../src/server/extract/index";
import { reconcile, duplicateNames, type PreparedDoc } from "../src/server/reconcile";
import { computeRecommendation } from "../src/lib/conclusion";
import type { AuditDocument, AuditSession, DocumentType } from "../src/types/audit";

const root = "Sverko_Полный_комплект";
const outDir = path.resolve("public/demo/lab");

function docType(name: string, isReport: boolean): DocumentType {
  if (isReport) return "report";
  const lower = name.toLowerCase();
  if (/договор|допсоглашен|спецификац/.test(lower)) return "contract";
  if (/наклад|возврат/.test(lower)) return "waybill";
  if (/акт|протокол|паспорт|свидетельств|письм/.test(lower)) return "act";
  if (/счет|счёт/.test(lower)) return "invoice";
  if (/платеж|платёж/.test(lower)) return "payment";
  return "other";
}

async function prepare(file: string, isReport: boolean): Promise<PreparedDoc> {
  const name = path.basename(file);
  const read = await readFile(name, readFileSync(file));
  return { id: name, name, sha256: name, read, isReport };
}

const reportPath = path.join(root, "01_Отчет", "01_Отчет_октябрь_2025.xlsx");
const supportPaths = readdirSync(path.join(root, "02_Первичные_документы")).map((name) => path.join(root, "02_Первичные_документы", name));
const report = await prepare(reportPath, true);
const supporting: PreparedDoc[] = [];
for (const file of supportPaths) supporting.push(await prepare(file, false));
const checks = reconcile(report, supporting, []);
const notices = duplicateNames(report, supporting).map((name) => `«${name}» повторяет уже учтённый файл и не увеличивает суммы.`);
notices.push("Учебный комплект: организации, люди и операции вымышлены.");

rmSync(path.resolve("public/demo"), { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(reportPath, path.join(outDir, path.basename(reportPath)));
for (const file of supportPaths) cpSync(file, path.join(outDir, path.basename(file)));

const documents: AuditDocument[] = [report, ...supporting].map((doc) => {
  const preview = doc.read.preview.kind === "pdf"
    ? { kind: "pdf" as const, url: `/demo/lab/${encodeURIComponent(doc.name)}`, pageCount: doc.read.pageCount }
    : doc.read.preview.kind === "image"
      ? { kind: "image" as const, url: `/demo/lab/${encodeURIComponent(doc.name)}`, width: doc.read.preview.width, height: doc.read.preview.height }
      : doc.read.preview;
  const ext = doc.name.split(".").pop()?.toLowerCase();
  return {
    id: doc.id,
    name: doc.name,
    type: docType(doc.name, doc.isReport),
    mimeType: ext === "pdf"
      ? "application/pdf"
      : ext === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: readFileSync(path.join(outDir, doc.name)).length,
    pageCount: doc.read.pageCount,
    preview,
  };
});

const session: AuditSession = {
  id: "demo-equipment-oct-2026",
  title: "Оснащение лаборатории — октябрь 2025",
  description: "Учебный комплект SVK-LAB-2025-10: АО «Центр прикладных измерений» и ООО «СпектрЛаб Комплект», договор СЛ-16/2025. Организации и операции вымышлены.",
  createdAt: "2025-11-04T09:00:00.000Z",
  status: "in_review",
  isDemo: true,
  reportDocumentId: report.id,
  supportingDocumentIds: supporting.map((doc) => doc.id),
  checks,
  recommendation: computeRecommendation(checks),
  reviewerDecision: null,
  notices,
};
const contents = `import type { AuditDocument, AuditSession } from "@/types/audit";\n\nexport const realisticDocuments = ${JSON.stringify(documents)} as AuditDocument[];\n\nexport const realisticSession = ${JSON.stringify(session)} as AuditSession;\n`;
writeFileSync(path.resolve("src/mocks/realisticDemo.ts"), contents, "utf8");
const counts = { match: 0, mismatch: 0, not_found: 0, needs_review: 0 };
for (const check of checks) counts[check.status] += 1;
console.log(JSON.stringify(counts), "recommendation", session.recommendation, "docs", documents.length);
