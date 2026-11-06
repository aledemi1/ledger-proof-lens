// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeDb, readSession, saveReview } from "@/server/db";
import { readFile } from "@/server/extract";
import {
  actPdf,
  brokenPdf,
  contractDocx,
  docxReport,
  formulaReport,
  paperDocx,
  rentPaymentPdf,
  scanPng,
  scanReport,
  supplyReport,
  tableFile,
  waybill,
  writeAcceptanceFixtures,
} from "@/server/fixtures";
import { handleApi } from "@/server/http";
import { enqueue } from "@/server/process";
import { duplicateNames, reconcile, type PreparedDoc } from "@/server/reconcile";

const owner = "a".repeat(32);

async function prepare(name: string, buffer: Buffer, isReport: boolean): Promise<PreparedDoc> {
  const read = await readFile(name, buffer);
  return { id: name, name, sha256: name + buffer.length, read, isReport };
}

function byName(checks: { fieldName: string; status: string; discrepancy: string | null; sourceValue: string | null; evidenceReferences: { pageNumber: number; documentId: string }[] }[]) {
  return Object.fromEntries(checks.map((check) => [check.fieldName, check]));
}

describe("document reconciliation", () => {
  afterEach(() => closeDb());

  it("compares an xlsx report with an act and a waybill", async () => {
    const report = await prepare("Отчет_поставка.xlsx", supplyReport(), true);
    const act = await prepare("Акт_14.pdf", await actPdf("250 000,00 руб.", 1), false);
    const bill = await prepare("Накладная_34.xlsx", waybill("34", 47), false);
    const contract = await prepare("Договор_21-2026.docx", await contractDocx(), false);
    const payment = await prepare("Платеж_аренда.pdf", await rentPaymentPdf(), false);
    const checks = byName(reconcile(report, [act, bill, contract, payment], []));

    expect(checks["Стоимость поставки"]?.status).toBe("mismatch");
    expect(checks["Стоимость поставки"]?.discrepancy).toBe("+30 000 ₽");
    expect(checks["Стоимость поставки"]?.evidenceReferences[0]?.documentId).toBe("Акт_14.pdf");
    expect(checks["Стоимость поставки"]?.evidenceReferences[0]?.pageNumber).toBe(1);
    expect(checks["Количество"]?.status).toBe("mismatch");
    expect(checks["Количество"]?.discrepancy).toBe("+3 шт.");
    expect(checks["Количество"]?.evidenceReferences[0]?.documentId).toBe("Накладная_34.xlsx");
    expect(checks["Транспортные расходы"]?.status).toBe("not_found");
    expect(checks["Транспортные расходы"]?.evidenceReferences).toEqual([]);
    expect(checks["Номер договора"]?.status).toBe("match");
    expect(checks["ИНН поставщика"]?.status).toBe("match");
    expect(checks["Поставщик"]?.status).toBe("match");
    expect(checks["Дата передачи"]?.status).toBe("needs_review");
    expect(checks["Дата передачи"]?.evidenceReferences.map((item) => item.documentId).sort()).toEqual(["Акт_14.pdf", "Накладная_34.xlsx"]);
    expect(JSON.stringify(checks["Транспортные расходы"])).not.toContain("Платеж_аренда.pdf");
  });

  it("keeps the first audit unchanged when a later act matches on page 2", async () => {
    const report = await prepare("Отчет_поставка.xlsx", supplyReport(), true);
    const firstAct = await prepare("Акт_14.pdf", await actPdf("250 000,00 руб.", 1), false);
    const secondAct = await prepare("Акт_14_стр2.pdf", await actPdf("280 000,00 руб.", 2), false);
    const first = reconcile(report, [firstAct], []);
    const second = reconcile(report, [secondAct], []);
    expect(first.find((check) => check.fieldName === "Стоимость поставки")?.discrepancy).toBe("+30 000 ₽");
    const cost = second.find((check) => check.fieldName === "Стоимость поставки");
    expect(cost?.status).toBe("match");
    expect(cost?.evidenceReferences[0]?.pageNumber).toBe(2);
  });

  it("sums partial waybills and ignores a duplicate file", async () => {
    const report = await prepare(
      "Отчет_части.xlsx",
      tableFile("Отчёт", [
        ["Показатель", "Значение"],
        ["Наименование оборудования", "Сервер Dell PowerEdge"],
        ["Количество", "47 шт"],
      ]),
      true,
    );
    const first = await prepare("Накладная_33.xlsx", waybill("33", 30), false);
    const second = await prepare("Накладная_35.xlsx", waybill("35", 17), false);
    const copy = { ...second, id: "copy", name: "Накладная_35_копия.xlsx" };
    expect(duplicateNames(report, [first, second, copy])).toEqual(["Накладная_35_копия.xlsx"]);
    const qty = reconcile(report, [first, second, copy], []).find((check) => check.fieldName === "Количество");
    expect(qty?.status).toBe("match");
    expect(qty?.evidenceReferences).toHaveLength(2);
    expect(qty?.sourceValue).toContain("47");
  });

  it("does not let the report confirm itself", async () => {
    const report = await prepare("Отчет_поставка.xlsx", supplyReport(), true);
    const copy = await prepare("Отчет_копия.xlsx", supplyReport(), false);
    const cost = reconcile(report, [copy], []).find((check) => check.fieldName === "Стоимость поставки");
    expect(cost?.status).toBe("not_found");
    expect(cost?.evidenceReferences).toEqual([]);
  });

  it("reads a docx table and a formula without a cached value", async () => {
    const report = await prepare("Отчет_бумага.xlsx", docxReport(), true);
    const invoice = await prepare("Счет_бумага.docx", await paperDocx(), false);
    const qty = reconcile(report, [invoice], []).find((check) => check.fieldName === "Количество");
    expect(qty?.status).toBe("match");
    expect(qty?.evidenceReferences[0]?.locationInDocument).toMatch(/^t1r2c/);

    const formula = await prepare("Отчет_формула.xlsx", await formulaReport(), true);
    const missing = reconcile(formula, [], []).find((check) => check.fieldName === "Стоимость поставки");
    expect(missing?.status).toBe("needs_review");
    expect(missing?.reportValue).toBe("нет вычисленного значения");
  });

  it("marks the audit incomplete when one supporting file cannot be read", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sverko-"));
    process.env["SVERKO_DATA_DIR"] = dir;
    closeDb();
    const form = new FormData();
    form.set("title", "Неполный комплект");
    form.set("idempotencyKey", "incomplete-1");
    form.set("report", new File([new Uint8Array(supplyReport())], "Отчет_поставка.xlsx"), "Отчет_поставка.xlsx");
    form.set("supporting", new File([new Uint8Array(waybill("34", 47))], "Накладная_34.xlsx"), "Накладная_34.xlsx");
    form.append("supporting", new File([new Uint8Array(brokenPdf())], "Поврежденный.pdf"), "Поврежденный.pdf");
    form.set("supportingTypes", JSON.stringify(["waybill", "unknown"]));
    const response = await handleApi(new Request("http://localhost/api/audits", { method: "POST", body: form, headers: { cookie: `sverko_sid=${owner}` } }));
    expect(response.status).toBe(201);
    const created = (await response.json()) as { id: string };
    await enqueue(created.id);
    const session = readSession(created.id);
    expect(session?.fileErrors?.[0]?.fileName).toBe("Поврежденный.pdf");
    expect(session?.incomplete).toBe(true);
    expect(session?.checks.find((check) => check.fieldName === "Количество")?.status).toBe("mismatch");
    expect(session?.checks.find((check) => check.fieldName === "Транспортные расходы")?.status).toBe("needs_review");
    saveReview(created.id, session!.checks.find((check) => check.fieldName === "Количество")!.id, "verified", "Поставщик подтвердил 50 штук письмом");
    closeDb();
    const reopened = readSession(created.id);
    const reviewed = reopened?.checks.find((check) => check.fieldName === "Количество");
    expect(reviewed?.status).toBe("mismatch");
    expect(reviewed?.reviewerStatus).toBe("verified");
    expect(reviewed?.reviewerComment).toContain("письмом");
  });

  it("recognizes a readable scan", async () => {
    const report = await prepare("Отчет_работы.xlsx", scanReport(), true);
    const scan = await prepare("Акт_15_скан.png", await scanPng(), false);
    const cost = reconcile(report, [scan], []).find((check) => check.fieldName === "Стоимость работ");
    expect(cost?.status).toBe("match");
    expect(cost?.evidenceReferences[0]?.box).toBeTruthy();
  }, 120_000);

  it("writes the acceptance files", async () => {
    await writeAcceptanceFixtures();
  });
});
