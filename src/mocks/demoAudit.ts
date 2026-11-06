import type { AuditDocument, AuditSession, CheckResult } from "@/types/audit";

/** All data below is synthetic and does not refer to real organisations or people. */

export const DEMO_SESSION_ID = "demo-equipment-oct-2026";

const SUPPLIER = "ООО «ТехноЛаб Поставка»";
const BUYER = "АО «Северный научный центр»";
const ITEM = "Дозатор лабораторный одноканальный ДЛ-1000";

export const demoDocuments: AuditDocument[] = [
  {
    id: "doc-report",
    name: "Отчет_поставка_октябрь_2026.xlsx",
    type: "report",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 48_640,
    pageCount: 1,
    preview: {
      kind: "synthetic",
      pages: [
        {
          blocks: [
            {
              kind: "sheet",
              headers: ["№", "Показатель", "Значение"],
              rows: [
                ["1", "Номер договора", { text: "21-2026", anchor: "rep-1" }],
                ["2", "Дата договора", { text: "02.10.2026", anchor: "rep-2" }],
                ["3", "Поставщик", { text: SUPPLIER, anchor: "rep-3" }],
                ["4", "ИНН поставщика", { text: "7701234567", anchor: "rep-4" }],
                ["5", "Наименование оборудования", { text: ITEM, anchor: "rep-5" }],
                ["6", "Товарная накладная", { text: "№ 34 от 18.10.2026", anchor: "rep-6" }],
                ["7", "Акт приёма-передачи", { text: "№ 14 от 20.10.2026", anchor: "rep-7" }],
                ["8", "Стоимость оборудования, ₽", { text: "280 000,00", anchor: "rep-8" }],
                ["9", "Количество оборудования, шт.", { text: "50", anchor: "rep-9" }],
                ["10", "Транспортные расходы, ₽", { text: "12 000,00", anchor: "rep-10" }],
                ["11", "Подпись получателя в акте", { text: "Имеется", anchor: "rep-11" }],
                ["12", "Назначение платежа", { text: "Оплата оборудования по договору № 21-2026", anchor: "rep-12" }],
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "doc-contract",
    name: "Договор_21-2026.pdf",
    type: "contract",
    mimeType: "application/pdf",
    size: 412_300,
    pageCount: 2,
    preview: {
      kind: "synthetic",
      pages: [
        {
          blocks: [
            {
              kind: "title",
              text: ["ДОГОВОР ПОСТАВКИ № ", { text: "21-2026", anchor: "contract-number" }],
            },
            { kind: "meta", left: ["г. Москва"], right: [{ text: "«02» октября 2026 г.", anchor: "contract-date" }] },
            {
              kind: "paragraph",
              text: [
                { text: SUPPLIER, anchor: "contract-supplier" },
                ", ИНН 7701234567, именуемое в дальнейшем «Поставщик», в лице генерального директора Ершова К. А., действующего на основании Устава, с одной стороны, и ",
                BUYER,
                ", именуемое в дальнейшем «Покупатель», в лице директора Миронова П. С., с другой стороны, заключили настоящий договор о нижеследующем.",
              ],
            },
            { kind: "paragraph", text: ["1. ПРЕДМЕТ ДОГОВОРА"] },
            {
              kind: "paragraph",
              text: [
                "1.1. Поставщик обязуется передать в собственность Покупателя лабораторное оборудование (далее — «Товар»), а Покупатель обязуется принять и оплатить Товар. Наименование, количество и цена Товара определяются в Спецификации (Приложение № 1)."
              ],
            },
            {
              kind: "paragraph",
              text: [
                "1.2. Поставка осуществляется партиями. Факт передачи Товара подтверждается товарной накладной и актом приёма-передачи, подписанными уполномоченными представителями Сторон.",
              ],
            },
          ],
        },
        {
          blocks: [
            { kind: "paragraph", text: ["2. ЦЕНА И ПОРЯДОК РАСЧЁТОВ"] },
            {
              kind: "paragraph",
              text: [
                "2.1. Общая цена договора не может превышать 300 000 (триста тысяч) рублей 00 копеек, включая НДС 20 %.",
              ],
            },
            {
              kind: "paragraph",
              text: [
                "2.2. Оплата производится на основании счёта Поставщика в течение 10 банковских дней с даты подписания акта приёма-передачи.",
              ],
            },
            {
              kind: "signatures",
              items: [
                { role: "Поставщик", name: "К. А. Ершов", sign: ["/Ершов/"] },
                { role: "Покупатель", name: "П. С. Миронов", sign: ["/Миронов/"] },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "doc-act",
    name: "Акт_выполненных_работ_14.pdf",
    type: "act",
    mimeType: "application/pdf",
    size: 286_900,
    pageCount: 1,
    preview: {
      kind: "synthetic",
      pages: [
        {
          blocks: [
            {
              kind: "title",
              text: ["АКТ ПРИЁМА-ПЕРЕДАЧИ ", { text: "№ 14 от 20.10.2026", anchor: "act-number" }],
              subtitle: ["к договору поставки № 21-2026 от 02.10.2026"],
            },
            {
              kind: "paragraph",
              text: [
                SUPPLIER,
                " передал, а ",
                BUYER,
                " принял следующее оборудование в надлежащем состоянии, без видимых повреждений:",
              ],
            },
            {
              kind: "table",
              headers: ["№", "Наименование", "Ед.", "Сумма, ₽"],
              align: ["center", "left", "center", "right"],
              rows: [["1", ITEM, "шт.", "250 000,00"]],
            },
            {
              kind: "fields",
              rows: [
                {
                  label: "Стоимость оборудования",
                  value: [{ text: "250 000,00 ₽", anchor: "act-cost" }, " (двести пятьдесят тысяч рублей 00 копеек), в т. ч. НДС 20 %"],
                },
                { label: "Претензии по качеству", value: ["отсутствуют"] },
              ],
            },
            {
              kind: "signatures",
              items: [
                { role: "Передал", name: "К. А. Ершов", sign: ["/Ершов/"] },
                {
                  role: "Принял",
                  name: "______________",
                  sign: [{ text: "~ подпись ~", anchor: "act-signature", variant: "signature" }],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "doc-waybill",
    name: "Накладная_34.pdf",
    type: "waybill",
    mimeType: "application/pdf",
    size: 198_400,
    pageCount: 1,
    preview: {
      kind: "synthetic",
      pages: [
        {
          blocks: [
            {
              kind: "title",
              text: ["ТОВАРНАЯ НАКЛАДНАЯ ", { text: "№ 34 от 18.10.2026", anchor: "wb-number" }],
            },
            {
              kind: "fields",
              rows: [
                { label: "Грузоотправитель", value: [SUPPLIER] },
                { label: "Грузополучатель", value: [BUYER] },
                { label: "Основание", value: ["Договор поставки № 21-2026 от 02.10.2026"] },
              ],
            },
            {
              kind: "table",
              headers: ["№", "Наименование товара", "Ед.", "Кол-во", "Мест", "Масса брутто, кг"],
              align: ["center", "left", "center", "right", "right", "right"],
              rows: [
                [
                  "1",
                  { text: ITEM, anchor: "wb-item-name" },
                  "шт.",
                  { text: "47", anchor: "wb-qty" },
                  "4",
                  "38,2",
                ],
              ],
            },
            { kind: "paragraph", text: ["Всего мест: 4. Груз принят без пересчёта внутреннего содержимого."] },
            {
              kind: "signatures",
              items: [
                { role: "Отпуск груза произвёл", name: "Д. В. Лаптев", sign: ["/Лаптев/"] },
                { role: "Груз получил", name: "О. Н. Сорокина", sign: ["/Сорокина/"] },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "doc-invoice",
    name: "Счет_81.pdf",
    type: "invoice",
    mimeType: "application/pdf",
    size: 154_200,
    pageCount: 1,
    preview: {
      kind: "synthetic",
      pages: [
        {
          blocks: [
            { kind: "title", text: ["СЧЁТ НА ОПЛАТУ № 81 от 05.10.2026"] },
            {
              kind: "fields",
              rows: [
                { label: "Поставщик", value: [{ text: SUPPLIER, anchor: "inv-supplier" }] },
                { label: "ИНН / КПП", value: [{ text: "7701234567", anchor: "inv-inn" }, " / 770101001"] },
                { label: "Покупатель", value: [BUYER] },
              ],
            },
            {
              kind: "table",
              headers: ["№", "Товары (работы, услуги)", "Кол-во", "Сумма, ₽"],
              align: ["center", "left", "right", "right"],
              rows: [["1", ITEM, "50 шт.", "250 000,00"]],
            },
            {
              kind: "fields",
              rows: [
                { label: "Итого к оплате", value: ["250 000,00 ₽, в т. ч. НДС 20 % — 41 666,67 ₽"] },
                {
                  label: "Назначение платежа",
                  value: [{ text: "Оплата по договору № 21-2026 и сопутствующие услуги", anchor: "inv-purpose" }],
                },
              ],
            },
          ],
        },
      ],
    },
  },
];

const ev = (documentId: string, pageNumber: number, sourceText: string, anchor: string) => ({
  documentId,
  pageNumber,
  sourceText,
  locationInDocument: anchor,
});
const rep = (n: number, text: string) => ev("doc-report", 1, text, `rep-${n}`);

const base = { reviewerStatus: "pending" as const, reviewerComment: "" };

export const demoChecks: CheckResult[] = [
  {
    ...base,
    id: "c1",
    fieldName: "Номер договора",
    reportValue: "21-2026",
    sourceValue: "21-2026",
    discrepancy: null,
    status: "match",
    severity: "low",
    explanation: "Номер договора в отчёте совпадает с номером в заголовке договора поставки.",
    evidenceReferences: [ev("doc-contract", 1, "ДОГОВОР ПОСТАВКИ № 21-2026", "contract-number")],
    reportReference: rep(1, "21-2026"),
  },
  {
    ...base,
    id: "c2",
    fieldName: "Дата договора",
    reportValue: "02.10.2026",
    sourceValue: "02.10.2026",
    discrepancy: null,
    status: "match",
    severity: "low",
    explanation: "Дата заключения договора совпадает.",
    evidenceReferences: [ev("doc-contract", 1, "«02» октября 2026 г.", "contract-date")],
    reportReference: rep(2, "02.10.2026"),
  },
  {
    ...base,
    id: "c3",
    fieldName: "Наименование поставщика",
    reportValue: SUPPLIER,
    sourceValue: SUPPLIER,
    discrepancy: null,
    status: "match",
    severity: "low",
    explanation: "Наименование поставщика подтверждается договором и счётом на оплату.",
    evidenceReferences: [
      ev("doc-contract", 1, SUPPLIER, "contract-supplier"),
      ev("doc-invoice", 1, SUPPLIER, "inv-supplier"),
    ],
    reportReference: rep(3, SUPPLIER),
  },
  {
    ...base,
    id: "c4",
    fieldName: "ИНН поставщика",
    reportValue: "7701234567",
    sourceValue: "7701234567",
    discrepancy: null,
    status: "match",
    severity: "low",
    explanation: "ИНН поставщика совпадает с реквизитами в счёте на оплату.",
    evidenceReferences: [ev("doc-invoice", 1, "7701234567", "inv-inn")],
    reportReference: rep(4, "7701234567"),
  },
  {
    ...base,
    id: "c5",
    fieldName: "Наименование оборудования",
    reportValue: ITEM,
    sourceValue: ITEM,
    discrepancy: null,
    status: "match",
    severity: "low",
    explanation: "Наименование оборудования совпадает с товарной накладной.",
    evidenceReferences: [ev("doc-waybill", 1, ITEM, "wb-item-name")],
    reportReference: rep(5, ITEM),
  },
  {
    ...base,
    id: "c6",
    fieldName: "Реквизиты товарной накладной",
    reportValue: "№ 34 от 18.10.2026",
    sourceValue: "№ 34 от 18.10.2026",
    discrepancy: null,
    status: "match",
    severity: "low",
    explanation: "Номер и дата накладной совпадают.",
    evidenceReferences: [ev("doc-waybill", 1, "№ 34 от 18.10.2026", "wb-number")],
    reportReference: rep(6, "№ 34 от 18.10.2026"),
  },
  {
    ...base,
    id: "c7",
    fieldName: "Реквизиты акта приёма-передачи",
    reportValue: "№ 14 от 20.10.2026",
    sourceValue: "№ 14 от 20.10.2026",
    discrepancy: null,
    status: "match",
    severity: "low",
    explanation: "Номер и дата акта совпадают.",
    evidenceReferences: [ev("doc-act", 1, "№ 14 от 20.10.2026", "act-number")],
    reportReference: rep(7, "№ 14 от 20.10.2026"),
  },
  {
    ...base,
    id: "c8",
    fieldName: "Стоимость оборудования",
    reportValue: "280 000 ₽",
    sourceValue: "250 000 ₽",
    unit: "₽",
    discrepancy: "+30 000 ₽",
    status: "mismatch",
    severity: "high",
    explanation:
      "В отчёте указана стоимость оборудования 280 000 ₽, однако акт приёма-передачи № 14 подтверждает стоимость 250 000 ₽. Превышение составляет 30 000 ₽. Необходимо уточнить основание указанной в отчёте суммы.",
    evidenceReferences: [ev("doc-act", 1, "Стоимость оборудования: 250 000,00 ₽", "act-cost")],
    reportReference: rep(8, "280 000,00"),
  },
  {
    ...base,
    id: "c9",
    fieldName: "Количество поставленного оборудования",
    reportValue: "50 шт.",
    sourceValue: "47 шт.",
    unit: "шт.",
    discrepancy: "+3 шт.",
    status: "mismatch",
    severity: "high",
    explanation:
      "В отчёте указано 50 единиц оборудования, однако подтверждающая накладная содержит сведения о поставке 47 единиц. Необходимо уточнить количество фактически поставленного оборудования.",
    evidenceReferences: [ev("doc-waybill", 1, "Кол-во: 47", "wb-qty")],
    reportReference: rep(9, "50"),
  },
  {
    ...base,
    id: "c10",
    fieldName: "Транспортные расходы",
    reportValue: "12 000 ₽",
    sourceValue: null,
    unit: "₽",
    discrepancy: null,
    status: "not_found",
    severity: "medium",
    explanation:
      "В представленных документах не найдено подтверждение транспортных расходов в размере 12 000 ₽. Это не означает, что расход указан ошибочно, однако его документальное подтверждение отсутствует. Рекомендуется запросить подтверждающий документ.",
    evidenceReferences: [],
    reportReference: rep(10, "12 000,00"),
  },
  {
    ...base,
    id: "c11",
    fieldName: "Подпись получателя в акте",
    reportValue: "Имеется",
    sourceValue: "Неразборчива",
    discrepancy: null,
    status: "needs_review",
    severity: "low",
    explanation:
      "В графе «Принял» акта № 14 присутствует отметка, но подпись на скане недостаточно разборчива, расшифровка не заполнена. Требуется визуальная проверка сотрудником.",
    evidenceReferences: [ev("doc-act", 1, "Принял: ~ подпись ~", "act-signature")],
    reportReference: rep(11, "Имеется"),
  },
  {
    ...base,
    id: "c12",
    fieldName: "Назначение платежа",
    reportValue: "Оплата оборудования по договору № 21-2026",
    sourceValue: "Оплата по договору № 21-2026 и сопутствующие услуги",
    discrepancy: null,
    status: "needs_review",
    severity: "low",
    explanation:
      "Назначение платежа в счёте сформулировано неоднозначно: упоминаются «сопутствующие услуги», которые не детализированы в счёте. Необходимо убедиться, что вся сумма относится к оплате оборудования.",
    evidenceReferences: [ev("doc-invoice", 1, "Оплата по договору № 21-2026 и сопутствующие услуги", "inv-purpose")],
    reportReference: rep(12, "Оплата оборудования по договору № 21-2026"),
  },
];

export const demoSession: AuditSession = {
  id: DEMO_SESSION_ID,
  title: "Проверка отчёта о поставке оборудования — октябрь 2026",
  description: "Сверка отчёта о поставке лабораторного оборудования с договором, актом, накладной и счётом.",
  createdAt: "2026-11-02T09:14:00.000Z",
  status: "in_review",
  isDemo: true,
  reportDocumentId: "doc-report",
  supportingDocumentIds: ["doc-contract", "doc-act", "doc-waybill", "doc-invoice"],
  checks: demoChecks,
  recommendation: "revise",
  reviewerDecision: null,
};

/* ---------- Additional, smaller sample sessions for the list ---------- */

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
