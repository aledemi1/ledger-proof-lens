import type { DocumentType } from "@/types/audit";

export const docTypeLabel: Record<DocumentType, string> = {
  report: "Отчёт",
  contract: "Договор",
  act: "Акт",
  waybill: "Накладная",
  invoice: "Счёт",
  payment: "Платёжный документ",
  other: "Другое",
  unknown: "Тип не определён",
};

export const selectableDocTypes: DocumentType[] = ["unknown", "act", "invoice", "waybill", "contract", "payment", "other"];

export const REPORT_EXTENSIONS = ["pdf", "xlsx", "xls", "csv", "docx"];
export const SUPPORTING_EXTENSIONS = ["pdf", "xlsx", "xls", "csv", "docx", "jpg", "jpeg", "png"];
