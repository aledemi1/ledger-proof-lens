import type { AuditDocument, AuditSession } from "@/types/audit";
import { realisticDocuments, realisticSession } from "./realisticDemo";

/** Учебный комплект лаборатории. Организации и операции вымышлены, результат посчитан общим алгоритмом сверки. */

export const DEMO_SESSION_ID = realisticSession.id;
export const demoDocuments: AuditDocument[] = realisticDocuments;
export const demoSession: AuditSession = realisticSession;

const ev = (documentId: string, pageNumber: number, sourceText: string, anchor: string) => ({
  documentId,
  pageNumber,
  sourceText,
  locationInDocument: anchor,
});

const base = { reviewerStatus: "pending" as const, reviewerComment: "" };

const worksDocs: AuditDocument[] = [
  {
    id: "w-report",
    name: "Отчет_работы_сентябрь_2026.xlsx",
    type: "report",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 22_100,
    pageCount: 1,
    preview: { kind: "none", reason: "Просмотр отчёта для этого примера не подготовлен." },
  },
  {
    id: "w-act",
    name: "Акт_работ_09.pdf",
    type: "act",
    mimeType: "application/pdf",
    size: 201_000,
    pageCount: 1,
    preview: {
      kind: "synthetic",
      pages: [
        {
          blocks: [
            { kind: "title", text: ["АКТ ВЫПОЛНЕННЫХ РАБОТ ", { text: "№ 9 от 30.09.2026", anchor: "w-num" }] },
            {
              kind: "fields",
              rows: [
                { label: "Исполнитель", value: [{ text: "ООО «Сервис-Метрика»", anchor: "w-exec" }] },
                { label: "Работы", value: ["Поверка и калибровка лабораторных весов, 12 ед."] },
                { label: "Стоимость работ", value: [{ text: "96 000,00 ₽", anchor: "w-sum" }] },
              ],
            },
          ],
        },
      ],
    },
  },
];

const worksSession: AuditSession = {
  id: "sample-works-sep-2026",
  title: "Отчёт о выполнении работ — сентябрь 2026",
  createdAt: "2026-10-06T12:40:00.000Z",
  status: "completed",
  isDemo: true,
  reportDocumentId: "w-report",
  supportingDocumentIds: ["w-act"],
  recommendation: "accept",
  reviewerDecision: { decision: "accept", comment: "", decidedAt: "2026-10-07T08:00:00.000Z" },
  checks: [
    { ...base, id: "w1", fieldName: "Реквизиты акта", reportValue: "№ 9 от 30.09.2026", sourceValue: "№ 9 от 30.09.2026", discrepancy: null, status: "match", severity: "low", explanation: "Реквизиты акта совпадают.", evidenceReferences: [ev("w-act", 1, "№ 9 от 30.09.2026", "w-num")] },
    { ...base, id: "w2", fieldName: "Исполнитель", reportValue: "ООО «Сервис-Метрика»", sourceValue: "ООО «Сервис-Метрика»", discrepancy: null, status: "match", severity: "low", explanation: "Исполнитель совпадает.", evidenceReferences: [ev("w-act", 1, "ООО «Сервис-Метрика»", "w-exec")] },
    { ...base, id: "w3", fieldName: "Стоимость работ", reportValue: "96 000 ₽", sourceValue: "96 000 ₽", unit: "₽", discrepancy: null, status: "match", severity: "low", explanation: "Стоимость работ совпадает.", evidenceReferences: [ev("w-act", 1, "96 000,00 ₽", "w-sum")] },
  ],
};

const labDocs: AuditDocument[] = [
  {
    id: "l-report",
    name: "Закупка_материалов_Q3.xlsx",
    type: "report",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 31_800,
    pageCount: 1,
    preview: { kind: "none", reason: "Просмотр отчёта для этого примера не подготовлен." },
  },
  {
    id: "l-invoice",
    name: "Счет_57.pdf",
    type: "invoice",
    mimeType: "application/pdf",
    size: 120_400,
    pageCount: 1,
    preview: {
      kind: "synthetic",
      pages: [
        {
          blocks: [
            { kind: "title", text: ["СЧЁТ НА ОПЛАТУ ", { text: "№ 57 от 14.08.2026", anchor: "l-num" }] },
            {
              kind: "fields",
              rows: [
                { label: "Поставщик", value: [{ text: "ООО «Реактив-Снаб»", anchor: "l-sup" }] },
                { label: "Товары", value: ["Пробирки, наконечники для дозаторов, реактивы"] },
                { label: "Итого к оплате", value: [{ text: "46 800,00 ₽", anchor: "l-sum" }] },
              ],
            },
          ],
        },
      ],
    },
  },
];

const labSession: AuditSession = {
  id: "sample-lab-materials",
  title: "Проверка закупки лабораторных материалов",
  createdAt: "2026-09-18T07:20:00.000Z",
  status: "completed",
  isDemo: true,
  reportDocumentId: "l-report",
  supportingDocumentIds: ["l-invoice"],
  recommendation: "revise",
  reviewerDecision: { decision: "revise", comment: "", decidedAt: "2026-09-19T10:00:00.000Z" },
  checks: [
    { ...base, id: "l1", fieldName: "Реквизиты счёта", reportValue: "№ 57 от 14.08.2026", sourceValue: "№ 57 от 14.08.2026", discrepancy: null, status: "match", severity: "low", explanation: "Реквизиты счёта совпадают.", evidenceReferences: [ev("l-invoice", 1, "№ 57 от 14.08.2026", "l-num")] },
    { ...base, id: "l2", fieldName: "Поставщик", reportValue: "ООО «Реактив-Снаб»", sourceValue: "ООО «Реактив-Снаб»", discrepancy: null, status: "match", severity: "low", explanation: "Поставщик совпадает.", evidenceReferences: [ev("l-invoice", 1, "ООО «Реактив-Снаб»", "l-sup")] },
    { ...base, reviewerStatus: "confirmed", id: "l3", fieldName: "Сумма закупки", reportValue: "48 600 ₽", sourceValue: "46 800 ₽", unit: "₽", discrepancy: "+1 800 ₽", status: "mismatch", severity: "high", explanation: "Сумма в отчёте превышает итог счёта на 1 800 ₽ — вероятна перестановка цифр.", evidenceReferences: [ev("l-invoice", 1, "46 800,00 ₽", "l-sum")] },
  ],
};

const householdDocs: AuditDocument[] = [
  { id: "h-report", name: "Хоз_расходы_октябрь.xlsx", type: "report", mimeType: "application/vnd.ms-excel", size: 18_400, pageCount: 1, preview: { kind: "none", reason: "Документ ожидает обработки." } },
  { id: "h-1", name: "Чек_канцтовары_1022.pdf", type: "payment", mimeType: "application/pdf", size: 64_000, pageCount: 1, preview: { kind: "none", reason: "Документ ожидает обработки." } },
  { id: "h-2", name: "Накладная_хозтовары_118.pdf", type: "waybill", mimeType: "application/pdf", size: 92_300, pageCount: 1, preview: { kind: "none", reason: "Документ ожидает обработки." } },
];

const householdSession: AuditSession = {
  id: "sample-household",
  title: "Отчёт по хозяйственным расходам",
  createdAt: "2026-11-04T15:05:00.000Z",
  status: "awaiting_processing",
  isDemo: true,
  reportDocumentId: "h-report",
  supportingDocumentIds: ["h-1", "h-2"],
  recommendation: null,
  reviewerDecision: null,
  checks: [],
};

export const sampleSessions: AuditSession[] = [demoSession, worksSession, labSession, householdSession];
export const sampleDocuments: AuditDocument[] = [...demoDocuments, ...worksDocs, ...labDocs, ...householdDocs];
