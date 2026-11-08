import * as XLSX from "xlsx";
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
export function downloadFindingsWorkbook(title: string, conclusion: AuditConclusion, documents: AuditDocument[]): void {
  const nameOf = (id: string) => documents.find((document) => document.id === id)?.name ?? id;
  const remarks = conclusion.findings.map((finding) => ({
    Показатель: finding.fieldName,
    "В отчёте": finding.reportValue,
    "В источнике": finding.sourceValue ?? "",
    Статус: statusLabel[finding.status] ?? finding.status,
    Решение: reviewLabel[finding.reviewerStatus] ?? finding.reviewerStatus,
    Комментарий: finding.reviewerComment,
    Источники: finding.evidence.map((item) => `${item.documentName}, ${evidencePlace(item)}`).join("; "),
  }));
  const evidence = conclusion.findings.flatMap((finding) =>
    finding.evidence.map((item) => ({
      Показатель: finding.fieldName,
      Документ: item.documentName || nameOf(item.documentId),
      Место: evidencePlace(item),
      "В отчёте": finding.reportValue,
      "В источнике": finding.sourceValue ?? "",
      Комментарий: finding.reviewerComment,
    })),
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(remarks), "Замечания");
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(evidence.length ? evidence : [{ Показатель: "" }]), "Доказательства");
  XLSX.writeFile(book, `${title.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 80) || "sverko"}_замечания.xlsx`);
}
