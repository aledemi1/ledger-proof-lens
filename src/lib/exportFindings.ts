import * as XLSX from "xlsx";
import type { Locale } from "@/i18n/locales";
import { copy } from "@/i18n/messages";
import type { AuditConclusion, AuditDocument } from "@/types/audit";
import { evidencePlace } from "./format";

const statusLabel: Record<string, string> = {
  mismatch: "Расхождение",
  not_found: "Нет подтверждения",
  needs_review: "Ручная проверка",
  match: "Совпадает",
};

const reviewLabel: Record<string, string> = {
  pending: "Не рассмотрено",
  confirmed: "Подтверждено",
  verified: "Снято",
};

/** Compact registry plus the quotes the conclusion relies on. */
export function downloadFindingsWorkbook(title: string, conclusion: AuditConclusion, documents: AuditDocument[], locale: Locale = "ru"): void {
  const t = copy[locale].conclusion;
  const nameOf = (id: string) => documents.find((document) => document.id === id)?.name ?? id;
  const remarks = conclusion.findings.map((finding) => ({
    [t.excelField]: finding.fieldName,
    [t.excelReport]: finding.reportValue,
    [t.excelSource]: finding.sourceValue ?? "",
    [t.excelStatus]: statusLabel[finding.status] ?? finding.status,
    [t.excelDecision]: reviewLabel[finding.reviewerStatus] ?? finding.reviewerStatus,
    [t.excelComment]: finding.reviewerComment,
    [t.excelSources]: finding.evidence.map((item) => `${item.documentName}, ${evidencePlace(item)}`).join("; "),
  }));
  const evidence = conclusion.findings.flatMap((finding) =>
    finding.evidence.map((item) => ({
      [t.excelField]: finding.fieldName,
      [t.excelDocument]: item.documentName || nameOf(item.documentId),
      [t.excelPlace]: evidencePlace(item),
      [t.excelReport]: finding.reportValue,
      [t.excelSource]: finding.sourceValue ?? "",
      [t.excelComment]: finding.reviewerComment,
    })),
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(remarks), t.sheetFindings.slice(0, 31));
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(evidence.length ? evidence : [{ [t.excelField]: "" }]), t.sheetEvidence.slice(0, 31));
  XLSX.writeFile(book, `${title.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 80) || "sverko"}_${t.fileSuffix}.xlsx`);
}
