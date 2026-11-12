// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { aiConfig } from "@/server/env";
import { readFile } from "@/server/extract";
import { laptopActPdf, laptopReport, laptopWaybill } from "@/server/fixtures";
import { classifyLabels, compareLinkedValues, judgePackFinding, refineWithModel, reviewPackWithModel, scanPackForDiscrepancies, scanPackInTwoStages, shownStatus, type PackFinding } from "@/server/llm";
import { reconcile, unknownLabels, type PreparedDoc, type RoleHints } from "@/server/reconcile";
import type { Locale } from "@/i18n/locales";
import { formatExplanation } from "@/lib/explanations";
import type { CheckResult } from "@/types/audit";

const said = (explanation: CheckResult["explanation"] | undefined, locale: Locale = "ru") => formatExplanation(explanation, locale);
import type { ReadDocument } from "@/server/model";

async function prepare(name: string, buffer: Buffer, isReport: boolean): Promise<PreparedDoc> {
  const read = await readFile(name, buffer);
  return { id: name, name, sha256: name + buffer.length, read, isReport };
}

async function laptopSet() {
  return {
    report: await prepare("Отчет_ноутбуки.xlsx", laptopReport(), true),
    supporting: [await prepare("Накладная_52.xlsx", laptopWaybill(), false), await prepare("Акт_21.pdf", await laptopActPdf(), false)],
  };
}

function field(checks: ReturnType<typeof reconcile>, name: string) {
  return checks.find((check) => check.fieldName === name);
}

const config = { baseUrl: "https://model.test/v1", apiKey: "test", model: "test-model" };

function answer(content: unknown) {
  return vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 }));
}

describe("language model labels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["SVERKO_PRIVACY"];
  });

  function withoutMask() {
    process.env["SVERKO_PRIVACY"] = "off";
  }

  it("leaves unknown labels for manual review without a model", async () => {
    const { report, supporting } = await laptopSet();
    const checks = reconcile(report, supporting, []);
    expect(field(checks, "Принято на склад")?.status).toBe("needs_review");
    expect(field(checks, "К оплате по акту")?.status).toBe("needs_review");
    expect(field(checks, "Номер договора")?.status).toBe("match");
  });

  it("sends only labels the rules do not know", async () => {
    const { report, supporting } = await laptopSet();
    const labels = unknownLabels([report, ...supporting]).map((item) => item.label);
    expect(labels).toEqual(expect.arrayContaining(["Принято на склад", "К оплате по акту", "Отпущено", "Начислено к оплате"]));
    expect(labels).not.toContain("Номер договора");
    expect(labels).not.toContain("Наименование оборудования");
  });

  it("compares values in code once the model names the labels", async () => {
    const { report, supporting } = await laptopSet();
    const hints: RoleHints = new Map([
      ["принято на склад", "quantity"],
      ["отпущено", "quantity"],
      ["к оплате по акту", "line_total"],
      ["начислено к оплате", "line_total"],
    ]);
    const checks = reconcile(report, supporting, [], hints);
    const qty = field(checks, "Принято на склад");
    expect(qty?.status).toBe("mismatch");
    expect(qty?.discrepancy).toBe("+2 шт.");
    expect(qty?.evidenceReferences[0]?.documentId).toBe("Накладная_52.xlsx");
    expect(said(qty?.explanation)).toContain("Языковая модель определила смысл подписи");
    expect(said(qty?.explanation, "en")).toContain("language model");
    expect(said(qty?.explanation, "zh")).not.toContain("Языковая модель");
    const total = field(checks, "К оплате по акту");
    expect(total?.status).toBe("mismatch");
    expect(total?.discrepancy).toBe("+50 000 ₽");
    expect(total?.evidenceReferences[0]?.documentId).toBe("Акт_21.pdf");
    expect(total?.evidenceReferences[0]?.pageNumber).toBe(1);
  });

  it("ignores a role whose value does not parse as that role", async () => {
    const { report, supporting } = await laptopSet();
    const checks = reconcile(report, supporting, [], new Map([["принято на склад", "date"]]));
    expect(field(checks, "Принято на склад")?.status).toBe("needs_review");
  });

  it("keeps only known ids and allowed roles from the answer", async () => {
    withoutMask();
    vi.stubGlobal(
      "fetch",
      answer({
        labels: [
          { id: "l1", role: "quantity" },
          { id: "l2", role: "drop table" },
          { id: "l99", role: "line_total" },
          { " id": "l3", role: "line_total" },
        ],
      }),
    );
    const hints = await classifyLabels(config, [
      { label: "Принято на склад", sample: "20 шт" },
      { label: "К оплате по акту", sample: "1 450 000,00 ₽" },
      { label: "Отпущено", sample: "18" },
    ]);
    expect([...hints]).toEqual([["принято на склад", "quantity"]]);
  });

  it("retries without temperature when the model rejects it", async () => {
    withoutMask();
    const calls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { temperature?: number };
        calls.push(body);
        if (body.temperature != null) return new Response(JSON.stringify({ error: { message: "`temperature` is deprecated" } }), { status: 400 });
        return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"labels":[{"id":"l1","role":"quantity"}]}\n```' } }] }), { status: 200 });
      }),
    );
    const hints = await classifyLabels(config, [{ label: "Отпущено", sample: "18" }]);
    expect(hints.get("отпущено")).toBe("quantity");
    expect(calls).toHaveLength(2);
  });

  it("sends the request again when the model returns broken JSON", async () => {
    withoutMask();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        const content = calls === 1 ? "{\"labels\":[{\"id\":\"l1\",\"role\":" : "{\"labels\":[{\"id\":\"l1\",\"role\":\"quantity\"}]}";
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
      }),
    );
    const hints = await classifyLabels(config, [{ label: "Отпущено", sample: "18" }]);
    expect(hints.get("отпущено")).toBe("quantity");
    expect(calls).toBe(2);
  });
});

describe("linked quote is compared in code", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["SVERKO_PRIVACY"];
  });

  it("turns a quoted amount into a mismatch and ignores a quote that is not in the file", async () => {
    process.env["SVERKO_PRIVACY"] = "off";
    process.env["AI_API_KEY"] = "test";
    process.env["AI_BASE_URL"] = "https://model.test/v1";
    process.env["AI_MODEL"] = "test-model";
    const support = doc("Акт_9.pdf", "f1", "Начислено к оплате 1 400 000,00 руб. за поставку.");
    const report = doc("Отчет.xlsx", "r1", "1 450 000,00 ₽");
    const open = reviewCheck("c1", "К оплате по акту", "1 450 000,00 ₽", "r1");
    const invented = reviewCheck("c3", "К оплате по акту", "1 450 000,00 ₽", "r1");
    const settled = reviewCheck("c2", "Номер договора", "45-2026", "r2");
    settled.status = "match";
    settled.explanation = "Совпадает по правилам.";
    vi.stubGlobal(
      "fetch",
      answer({
        links: [
          { checkId: "c1", supportFragmentId: "Акт_9.pdf:f1", quote: "1 400 000,00 руб." },
          { checkId: "c1", supportFragmentId: "Акт_9.pdf:f1", quote: "9 999 999 руб." },
          { checkId: "c3", supportFragmentId: "Акт_9.pdf:f1", quote: "9 999 999 руб." },
          { checkId: "c2", supportFragmentId: "Акт_9.pdf:f1", quote: "1 400 000,00 руб." },
        ],
      }),
    );
    const [linked, skipped, untouched] = await refineWithModel([open, invented, settled], report, [support]);
    expect(linked?.status).toBe("mismatch");
    expect(linked?.discrepancy).toBe("+50 000 ₽");
    expect(linked?.evidenceReferences[0]?.documentId).toBe("Акт_9.pdf");
    expect(linked?.evidenceReferences[0]?.locationInDocument).toBe("f1");
    expect(said(linked?.explanation)).toContain("сервер сверил");
    expect(said(linked?.explanation, "de")).toContain("Server");
    expect(skipped?.status).toBe("needs_review");
    expect(skipped?.sourceValue).toBeNull();
    expect(untouched?.status).toBe("match");
    expect(untouched?.sourceValue).toBeNull();
  });

  it("reviews the whole pack without reopening a settled row", async () => {
    process.env["SVERKO_PRIVACY"] = "off";
    process.env["AI_API_KEY"] = "test";
    process.env["AI_BASE_URL"] = "https://model.test/v1";
    process.env["AI_MODEL"] = "test-model";
    const support = doc("Накладная.pdf", "f1", "Передано 10 шт. Стоимость партии 7 200 руб.");
    const report = doc("Отчет.xlsx", "r1", "12 шт");
    const open = reviewCheck("c1", "Стоимость", "8 000 ₽", "r1");
    open.status = "not_found";
    open.explanation = "В прочитанном комплекте нет подтверждения.";
    const settled = reviewCheck("c2", "Количество", "12 шт", "r2");
    settled.status = "match";
    settled.explanation = "Источник подтверждает количество.";
    settled.discrepancy = null;
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(String(init.body));
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    links: [
                      { checkId: "c1", supportFragmentId: "Накладная.pdf:f1", quote: "7 200 руб." },
                      { checkId: "c2", supportFragmentId: "Накладная.pdf:f1", quote: "10 шт" },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      }),
    );
    const [linked, untouched] = (await reviewPackWithModel([open, settled], report, [support])).checks;
    expect(bodies[0]).toContain("всего комплекта");
    expect(linked?.status).toBe("mismatch");
    expect(linked?.discrepancy).toBe("+800 ₽");
    expect(linked?.evidenceReferences[0]?.documentId).toBe("Накладная.pdf");
    expect(untouched?.status).toBe("match");
    expect(untouched?.discrepancy).toBeNull();
    expect(said(untouched?.explanation)).toContain("Автоматический статус не изменён");
  });

  it("does not treat a contract price as a completed payment", async () => {
    process.env["SVERKO_PRIVACY"] = "off";
    process.env["AI_API_KEY"] = "test";
    process.env["AI_BASE_URL"] = "https://model.test/v1";
    process.env["AI_MODEL"] = "test-model";
    const support = doc("Договор.docx", "f1", "Стоимость заказа — 50 000 рублей.");
    const report = doc("Отчет.xlsx", "r1", "50 000 ₽");
    const open = reviewCheck("c1", "Оплачено за октябрь", "50 000 ₽", "r1");
    open.status = "not_found";
    open.explanation = "В прочитанном комплекте нет подтверждения.";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      links: [{ checkId: "c1", supportFragmentId: "Договор.docx:f1", quote: "50 000 рублей" }],
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );
    const [linked] = (await reviewPackWithModel([open], report, [support])).checks;
    expect(linked?.status).toBe("needs_review");
    expect(said(linked?.explanation)).toContain("не закрыт");
  });

  it("accepts equal quantities from the quote", () => {
    expect(compareLinkedValues("20 шт", "20 шт.")?.status).toBe("match");
    expect(compareLinkedValues("20 шт", "18 шт")?.discrepancy).toBe("+2 шт.");
    expect(compareLinkedValues("25.10.2026", "30.10.2026")?.status).toBe("mismatch");
    expect(compareLinkedValues("да", "выполнено")).toBeNull();
    expect(compareLinkedValues("10 шт.", "Блок контроля БК-8 — 10 шт")?.status).toBe("match");
    expect(compareLinkedValues("40", "35")?.status).toBe("mismatch");
    expect(compareLinkedValues("18", "фактическая продолжительность — 16 часов")?.discrepancy).toBe("+2 час");
    expect(compareLinkedValues("36,000.00", "36 000,00")?.status).toBe("match");
    expect(compareLinkedValues("36,000.00", "Предоставление конференц-зала 2 18 000,00 36 000,00")?.status).toBe("match");
    expect(compareLinkedValues("15,000.00", "Аренда комплекта оборудования 2 6 500,00 13 000,00")?.discrepancy).toBe("+2 000 ₽");
  });
});

function reviewCheck(id: string, fieldName: string, reportValue: string, anchor: string): CheckResult {
  return {
    id,
    fieldName,
    reportValue,
    sourceValue: null,
    discrepancy: null,
    status: "needs_review",
    severity: "medium",
    explanation: "Формулировка не сопоставлена однозначно. Для смыслового сравнения нужен ключ языковой модели либо ручная проверка.",
    evidenceReferences: [],
    reportReference: { documentId: "Отчет.xlsx", pageNumber: 0, sourceText: reportValue, locationInDocument: anchor, locationLabel: "ячейка" },
    reviewerStatus: "pending",
    reviewerComment: "",
  };
}

function doc(name: string, anchor: string, text: string): PreparedDoc {
  const read: ReadDocument = {
    fragments: [{ id: anchor, text, pageNumber: 1, locationLabel: "Стр. 1", anchor, shape: "line" }],
    preview: { kind: "none", reason: "тест" },
    pageCount: 1,
    text,
    warnings: [],
  };
  return { id: name, name, sha256: name, read, isReport: name.startsWith("Отчет") };
}

describe("full-pack discrepancy scan", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["SVERKO_PRIVACY"];
  });

  it("keeps a quoted source and marks an invented quote", async () => {
    process.env["SVERKO_PRIVACY"] = "off";
    process.env["AI_API_KEY"] = "test";
    process.env["AI_BASE_URL"] = "https://model.test/v1";
    process.env["AI_MODEL"] = "test-model";
    const report = doc("Отчет.xlsx", "r1", "Ночей проживания: 4");
    const support = doc("Счёт.pdf", "f1", "Гостиница подтверждает 3 оплаченные ночи");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        expect(String(init.body)).toContain("первичные документы");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    findings: [
                      {
                        name: "Ночей проживания",
                        reportValue: "4",
                        reportFragmentId: "Отчет.xlsx:r1",
                        reportQuote: "4",
                        sourceValue: "3",
                        sourceFragmentId: "Счёт.pdf:f1",
                        sourceQuote: "3 оплаченные ночи",
                        relation: "different",
                      },
                      {
                        name: "Выдумка",
                        reportValue: "9",
                        reportFragmentId: "Отчет.xlsx:r1",
                        reportQuote: "9",
                        sourceValue: "8",
                        sourceFragmentId: "Счёт.pdf:f1",
                        sourceQuote: "восемь ночей",
                        relation: "different",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      }),
    );
    const { findings } = await scanPackForDiscrepancies(report, [support]);
    expect(findings[0]?.relation).toBe("different");
    expect(findings[0]?.sourceQuoteFound).toBe(true);
    expect(findings[0]?.sourceWhere).toContain("Счёт.pdf");
    expect(findings[1]?.sourceQuoteFound).toBe(false);
  });

  it("asks for report indicators before the pack", async () => {
    process.env["SVERKO_PRIVACY"] = "off";
    process.env["AI_API_KEY"] = "test";
    process.env["AI_BASE_URL"] = "https://model.test/v1";
    process.env["AI_MODEL"] = "test-model";
    const report = doc("Отчет.xlsx", "r1", "Ночей проживания: 4");
    const support = doc("Счёт.pdf", "f1", "Гостиница подтверждает 3 оплаченные ночи");
    let step = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        step += 1;
        const content = step === 1
          ? JSON.stringify({ indicators: [{ name: "Ночей проживания", reportValue: "4", reportFragmentId: "Отчет.xlsx:r1", reportQuote: "Ночей проживания: 4" }] })
          : JSON.stringify({ findings: [{ name: "Ночей проживания", reportValue: "4", reportFragmentId: "Отчет.xlsx:r1", reportQuote: "Ночей проживания: 4", sourceCount: 1, sources: "Счёт.pdf:f1 | 3 оплаченные ночи", relation: "different" }] });
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
      }),
    );
    const { findings } = await scanPackInTwoStages(report, [support]);
    expect(step).toBe(2);
    expect(findings[0]?.name).toBe("Ночей проживания");
    expect(findings[0]?.relation).toBe("different");
  });

  it("reads every comma-separated source", async () => {
    process.env["SVERKO_PRIVACY"] = "off";
    process.env["AI_API_KEY"] = "test";
    process.env["AI_BASE_URL"] = "https://model.test/v1";
    process.env["AI_MODEL"] = "test-model";
    const report = doc("Отчет.xlsx", "r1", "Итого 141 000 ₽");
    const act = doc("Акт.pdf", "f1", "Общая сумма по акту: 49 000 рублей.");
    const food = doc("Питание.pdf", "f2", "Итоговая стоимость: 59 500,00 рублей.");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              findings: [{
                name: "Итого",
                reportValue: "141 000 ₽",
                reportFragmentId: "Отчет.xlsx:r1",
                reportQuote: "141 000 ₽",
                sourceCount: 2,
                sources: "Акт.pdf:f1 | 49 000 рублей, Питание.pdf:f2 | 59 500,00 рублей",
                sourceValue: "108 500 ₽",
                relation: "different",
              }],
            }),
          },
        }],
      }), { status: 200 })),
    );
    const [finding] = (await scanPackForDiscrepancies(report, [act, food])).findings;
    expect(finding?.sourceCount).toBe(2);
    expect(finding?.sources.map((source) => source.fragmentId)).toEqual(["Акт.pdf:f1", "Питание.pdf:f2"]);
    expect(finding?.sources.every((source) => source.quoteFound)).toBe(true);
  });

  it("sums several quoted parts of one open row", async () => {
    process.env["SVERKO_PRIVACY"] = "off";
    process.env["AI_API_KEY"] = "test";
    process.env["AI_BASE_URL"] = "https://model.test/v1";
    process.env["AI_MODEL"] = "test-model";
    const report = doc("Отчет.xlsx", "r1", "141 000 ₽");
    const act = doc("Акт.pdf", "f1", "Общая сумма по акту: 49 000 рублей.");
    const food = doc("Питание.pdf", "f2", "Итоговая стоимость: 59 500,00 рублей.");
    const print = doc("Печать.pdf", "f3", "Общая стоимость: 7 200,00 рублей.");
    const open = reviewCheck("c1", "Итого подтверждённых расходов", "141 000 ₽", "r1");
    open.status = "not_found";
    open.explanation = "В прочитанном комплекте нет подтверждения.";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              links: [{
                checkId: "c1",
                sourceCount: 3,
                sources: "Акт.pdf:f1 | 49 000 рублей, Питание.pdf:f2 | 59 500,00 рублей, Печать.pdf:f3 | 7 200,00 рублей",
              }],
            }),
          },
        }],
      }), { status: 200 })),
    );
    const [linked] = (await reviewPackWithModel([open], report, [act, food, print])).checks;
    expect(linked?.status).toBe("mismatch");
    expect(linked?.discrepancy).toBe("+25 300 ₽");
    expect(linked?.evidenceReferences).toHaveLength(3);
    expect(said(linked?.explanation)).toContain("3 источников");
    expect(said(linked?.explanation, "en")).toContain("3 sources");
  });
});

describe("pack finding judge", () => {
  const finding = (patch: Partial<PackFinding>): PackFinding => ({
    name: "Итого",
    reportValue: "141 000 ₽",
    reportFragmentId: "r",
    reportQuote: "141 000 ₽",
    reportWhere: "Отчет",
    sourceCount: 2,
    sources: [],
    sourceValue: "",
    sourceFragmentId: "",
    sourceQuote: "",
    sourceWhere: "",
    relation: "same",
    reportQuoteFound: true,
    sourceQuoteFound: true,
    ...patch,
  });

  it("sums the documents the model included even when the name is not a total", () => {
    const judged = judgePackFinding(finding({
      name: "Общепроизводственные затраты",
      reportValue: "1 145 798,10",
      sources: [
        { fragmentId: "a", quote: "245 000,00 руб.", value: "", where: "Акт 118", quoteFound: true, included: true, marked: true },
        { fragmentId: "b", quote: "318 298,10 руб.", value: "", where: "Счет 174", quoteFound: true, included: true, marked: true },
        { fragmentId: "c", quote: "270 000,00 руб.", value: "", where: "Записка", quoteFound: true, included: true, marked: true },
        { fragmentId: "d", quote: "300 000,00 руб.", value: "", where: "УПД", quoteFound: true, included: true, marked: true },
        { fragmentId: "e", quote: "165 000,00 руб.", value: "", where: "Акт июня", quoteFound: true, included: false, marked: true, reason: "вне периода" },
      ],
    }));
    expect(judged.relation).toBe("different");
    expect(judged.sourceValue).toBe("1 133 298,10 ₽");
    expect(judged.calculation).toContain("245 000");
    expect(judged.calculation).toContain("вне периода");
    expect(judged.sources.map((source) => source.fragmentId)).toEqual(["a", "b", "c", "d"]);
  });

  it("does not sum several amounts inside one included quote", () => {
    const judged = judgePackFinding(finding({
      name: "Общепроизводственные затраты",
      reportValue: "245 000,00",
      sources: [
        { fragmentId: "a", quote: "План 245 000,00 руб. Факт 100 000,00 руб.", value: "", where: "Акт", quoteFound: true, included: true, marked: true },
      ],
    }));
    expect(judged.relation).not.toBe("same");
  });

  it("leaves an internal split unchecked", () => {
    const judged = judgePackFinding(finding({ name: "Трудоемкость", reportValue: "34,14", relation: "insufficient", sources: [] }));
    expect(judged.relation).toBe("insufficient");
  });

  it("sums verified parts and ignores the model's own verdict", () => {
    const judged = judgePackFinding(finding({
      sources: [
        { fragmentId: "a", quote: "49 000 рублей", value: "", where: "Акт", quoteFound: true },
        { fragmentId: "b", quote: "59 500,00 рублей", value: "", where: "Питание", quoteFound: true },
        { fragmentId: "c", quote: "7 200,00 рублей", value: "", where: "Печать", quoteFound: true },
      ],
    }));
    expect(judged.relation).toBe("different");
    expect(judged.sourceValue).toBe("115 700 ₽");
  });

  it("splits a prose date range into start and end", () => {
    const quote = "Семинар проведён 21 и 22 октября 2025 года.";
    const start = judgePackFinding(finding({
      name: "Дата начала семинара",
      reportValue: "21.10.2025",
      sources: [{ fragmentId: "a", quote, value: "", where: "Акт", quoteFound: true }],
    }));
    const end = judgePackFinding(finding({
      name: "Дата окончания семинара",
      reportValue: "22.10.2025",
      sources: [{ fragmentId: "a", quote, value: "", where: "Акт", quoteFound: true }],
    }));
    expect(start.relation).toBe("same");
    expect(end.relation).toBe("same");
  });

  it("reads a tariff inside a sentence", () => {
    const judged = judgePackFinding(finding({
      name: "Договорный тариф",
      reportValue: "6,35",
      sources: [{ fragmentId: "a", quote: "окончательная цена 6,35 рубля за кВт·ч", value: "", where: "Условия", quoteFound: true }],
    }));
    expect(judged.relation).toBe("same");
  });

  it("does not call different visible dates a match", () => {
    expect(shownStatus("31.12.2026", "31.08.2027", "match")).toBe("mismatch");
    expect(shownStatus("31.12.2026", "31.12.2026", "match")).toBe("match");
  });

  it("does not pick the amount that happens to equal the report", () => {
    const judged = judgePackFinding(finding({
      name: "Получено АН-21",
      reportValue: "10",
      sources: [{ fragmentId: "a", quote: "План 10 экз. Приёмка 6 экз.", value: "", where: "Приёмка", quoteFound: true }],
    }));
    expect(judged.relation).not.toBe("same");
  });

  it("does not match a received quantity quoted as a bare number", () => {
    const judged = judgePackFinding(finding({
      name: "Получено АН-21",
      reportValue: "10",
      sources: [{ fragmentId: "a", quote: "10", value: "", where: "План", quoteFound: true }],
    }));
    expect(judged.relation).not.toBe("same");
  });

  it("does not read the year marker as grams", () => {
    const judged = judgePackFinding(finding({
      name: "Масса порошка",
      reportValue: "500 г",
      sources: [{ fragmentId: "a", quote: "Договор от 12.10.2026 г. Передано 500 г.", value: "", where: "Акт", quoteFound: true }],
    }));
    expect(judged.relation).toBe("same");
    expect(judged.sourceValue).toContain("500");
    expect(judged.sourceValue).not.toContain("2026");
  });

  it("does not treat an unrelated place as another contract number", () => {
    const judged = judgePackFinding(finding({
      name: "Номер договора",
      reportValue: "КП-47/2026",
      sources: [{ fragmentId: "a", quote: "г. Калуга", value: "", where: "Договор", quoteFound: true }],
    }));
    expect(judged.relation).toBe("missing");
    expect(judged.sourceValue).toBe("");
  });

  it("reads a count and a term from the sentence the model quoted", () => {
    const count = judgePackFinding(finding({
      name: "Количество поставленных анализаторов Ав-10",
      reportValue: "12",
      sources: [{ fragmentId: "a", quote: "Стоимость переданного оборудования с НДС: 300 000 рублей. Получено 10 анализаторов Ав-10.", value: "", where: "Накладная", quoteFound: true }],
    }));
    const term = judgePackFinding(finding({
      name: "Гарантийный срок анализаторов Ав-10",
      reportValue: "24",
      sources: [{ fragmentId: "b", quote: "3. Гарантийный срок анализаторов Ав-10: 24 месяца с даты приёмки оборудования.", value: "", where: "Договор", quoteFound: true }],
    }));
    expect(count.relation).toBe("different");
    expect(count.sourceValue).toContain("10");
    expect(term.relation).toBe("same");
    expect(term.sourceValue).toContain("24");
  });

  it("drops an operation from another month", () => {
    const judged = judgePackFinding(finding({
      name: "Возврат переплаты, полученный в октябре",
      reportValue: "11 000 ₽",
      sources: [{ fragmentId: "a", quote: "03.11.2025 возврат 11 000 ₽", value: "", where: "Выписка", quoteFound: true }],
    }));
    expect(judged.relation).toBe("different");
    expect(judged.sourceValue).toBe("0");
  });
});

describe.runIf(process.env["SVERKO_LIVE_AI"] === "1")("live language model", () => {
  it("classifies the laptop labels and finds both discrepancies", async () => {
    const live = aiConfig();
    expect(live).not.toBeNull();
    const { report, supporting } = await laptopSet();
    const hints = await classifyLabels(live!, unknownLabels([report, ...supporting]));
    console.log("model hints", Object.fromEntries(hints));
    const checks = reconcile(report, supporting, [], hints);
    expect(field(checks, "Принято на склад")?.discrepancy).toBe("+2 шт.");
    expect(field(checks, "К оплате по акту")?.discrepancy).toBe("+50 000 ₽");
  }, 120_000);
});
