// @vitest-environment node
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { closeDb, readSession, saveReview } from "@/server/db";
import { all, run } from "@/server/store";
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
import { enqueue, enqueueRebuild } from "@/server/process";
import { duplicateNames, reconcile, type PreparedDoc } from "@/server/reconcile";

async function signIn(): Promise<string> {
  const response = await handleApi(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `user-${crypto.randomUUID()}@example.com`, password: "password123" }),
    }),
  );
  if (response.status !== 201) throw new Error(await response.text());
  const token = /sverko_auth=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1];
  if (!token) throw new Error("нет cookie");
  return `sverko_auth=${token}`;
}

async function prepare(name: string, buffer: Buffer, isReport: boolean): Promise<PreparedDoc> {
  const read = await readFile(name, buffer);
  return { id: name, name, sha256: name + buffer.length, read, isReport };
}

function byName(checks: { fieldName: string; status: string; discrepancy: string | null; sourceValue: string | null; evidenceReferences: { pageNumber: number; documentId: string }[] }[]) {
  return Object.fromEntries(checks.map((check) => [check.fieldName, check]));
}

describe("document reconciliation", () => {
  afterEach(async () => {
    await closeDb();
  });

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

  it("matches one report name against the same row in a catalog", async () => {
    const report = await prepare(
      "Отчет_имена.xlsx",
      tableFile("Оборудование", [
        ["Наименование", "Ед.", "Количество"],
        ["Дозатор ДЭ-100", "шт.", "1"],
        ["Весы ВА-220", "шт.", "1"],
      ]),
      true,
    );
    const spec = await prepare(
      "Спецификация.xlsx",
      tableFile("Оборудование", [
        ["Наименование", "Ед.", "Количество"],
        ["Дозатор ДЭ-100", "шт.", "1"],
        ["Весы ВА-220", "шт.", "1"],
        ["Центрифуга ЦЛ-6", "шт.", "1"],
      ]),
      false,
    );
    const names = reconcile(report, [spec], []).filter((check) => /наименован/i.test(check.fieldName));
    expect(names.map((check) => `${check.fieldName}=${check.status}:${check.reportValue}`).join(" | ")).toContain("ДЭ-100");
    expect(names.every((check) => check.status === "match")).toBe(true);
    const dispenser = names.find((check) => check.reportValue.includes("ДЭ-100"));
    expect(dispenser?.sourceValue).toContain("ДЭ-100");
    expect(dispenser?.sourceValue).not.toContain("ВА-220");
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
    await closeDb();
    const cookie = await signIn();
    const form = new FormData();
    form.set("title", "Неполный комплект");
    form.set("idempotencyKey", "incomplete-1");
    form.set("report", new File([new Uint8Array(supplyReport())], "Отчет_поставка.xlsx"), "Отчет_поставка.xlsx");
    form.set("supporting", new File([new Uint8Array(waybill("34", 47))], "Накладная_34.xlsx"), "Накладная_34.xlsx");
    form.append("supporting", new File([new Uint8Array(brokenPdf())], "Поврежденный.pdf"), "Поврежденный.pdf");
    form.set("supportingTypes", JSON.stringify(["waybill", "unknown"]));
    const response = await handleApi(new Request("http://localhost/api/audits", { method: "POST", body: form, headers: { cookie } }));
    expect(response.status).toBe(201);
    const created = (await response.json()) as { id: string };
    await enqueue(created.id);
    const session = await readSession(created.id);
    expect(session?.fileErrors?.[0]?.fileName).toBe("Поврежденный.pdf");
    expect(session?.incomplete).toBe(true);
    expect(session?.checks.find((check) => check.fieldName === "Количество")?.status).toBe("mismatch");
    expect(session?.checks.find((check) => check.fieldName === "Транспортные расходы")?.status).toBe("needs_review");
    await saveReview(created.id, session!.checks.find((check) => check.fieldName === "Количество")!.id, "verified", "Поставщик подтвердил 50 штук письмом");
    await closeDb();
    const reopened = await readSession(created.id);
    const reviewed = reopened?.checks.find((check) => check.fieldName === "Количество");
    expect(reviewed?.status).toBe("mismatch");
    expect(reviewed?.reviewerStatus).toBe("verified");
    expect(reviewed?.reviewerComment).toContain("письмом");
  });

  it("rechecks the whole set after a supporting document is added", async () => {
    process.env["SVERKO_DATA_DIR"] = mkdtempSync(path.join(tmpdir(), "sverko-"));
    await closeDb();
    const cookie = await signIn();
    const form = new FormData();
    form.set("title", "Частичная поставка");
    form.set("idempotencyKey", "add-doc-1");
    form.set("report", new File([new Uint8Array(tableFile("Отчёт", [["Показатель", "Значение"], ["Наименование оборудования", "Сервер Dell PowerEdge"], ["Количество", "47 шт"]]))], "Отчет_части.xlsx"), "Отчет_части.xlsx");
    form.set("supporting", new File([new Uint8Array(waybill("33", 30))], "Накладная_33.xlsx"), "Накладная_33.xlsx");
    const createdResponse = await handleApi(new Request("http://localhost/api/audits", { method: "POST", body: form, headers: { cookie } }));
    const created = (await createdResponse.json()) as { id: string };
    await enqueue(created.id);
    const before = await readSession(created.id);
    const quantity = before?.checks.find((check) => check.fieldName === "Количество");
    expect(quantity?.status).toBe("mismatch");
    await saveReview(created.id, quantity!.id, "verified", "Ждём вторую накладную");

    const extra = new FormData();
    extra.set("supporting", new File([new Uint8Array(waybill("35", 17))], "Накладная_35.xlsx"), "Накладная_35.xlsx");
    const added = await handleApi(new Request(`http://localhost/api/audits/${created.id}/documents`, { method: "POST", body: extra, headers: { cookie } }));
    expect(added.status).toBe(200);
    await enqueueRebuild(created.id);
    const after = await readSession(created.id);
    const summed = after?.checks.find((check) => check.fieldName === "Количество");
    expect(after?.supportingDocumentIds).toHaveLength(2);
    expect(summed?.status).toBe("match");
    expect(summed?.evidenceReferences).toHaveLength(2);
    expect(summed?.reviewerStatus).toBe("verified");
    expect(summed?.reviewerComment).toContain("накладную");
  });

  it("keeps check ids separate for every audit in one database", async () => {
    process.env["SVERKO_DATA_DIR"] = mkdtempSync(path.join(tmpdir(), "sverko-"));
    await closeDb();
    const cookie = await signIn();
    const ids: string[] = [];
    for (const quantity of [47, 50]) {
      const form = new FormData();
      form.set("title", `Комплект ${quantity}`);
      form.set("idempotencyKey", `separate-${quantity}`);
      form.set("report", new File([new Uint8Array(supplyReport())], "Отчет_поставка.xlsx"), "Отчет_поставка.xlsx");
      form.set("supporting", new File([new Uint8Array(waybill("34", quantity))], "Накладная_34.xlsx"), "Накладная_34.xlsx");
      const response = await handleApi(new Request("http://localhost/api/audits", { method: "POST", body: form, headers: { cookie } }));
      const created = (await response.json()) as { id: string };
      await enqueue(created.id);
      ids.push(created.id);
    }
    const [first, second] = await Promise.all(ids.map((id) => readSession(id)));
    expect(first?.checks.find((check) => check.fieldName === "Количество")?.status).toBe("mismatch");
    expect(second?.checks.find((check) => check.fieldName === "Количество")?.status).toBe("match");
    const quantityId = second!.checks.find((check) => check.fieldName === "Количество")!.id;
    await saveReview(second!.id, quantityId, "confirmed", "");
    expect((await readSession(first!.id))?.checks.find((check) => check.id === quantityId)?.reviewerStatus).toBe("pending");
  });

  it("moves checks from the older single-key table", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sverko-"));
    process.env["SVERKO_DATA_DIR"] = dir;
    await closeDb();
    const legacy = new DatabaseSync(path.join(dir, "sverko.sqlite"));
    legacy.exec(`
      CREATE TABLE checks (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, position INTEGER NOT NULL, payload TEXT NOT NULL);
      INSERT INTO checks VALUES ('c1', 'aud_old', 0, '{}');
    `);
    legacy.close();
    expect(await all<{ session_id: string }>("SELECT session_id FROM checks WHERE id = 'c1'")).toEqual([{ session_id: "aud_old" }]);
    await run("INSERT INTO checks (id, session_id, position, payload) VALUES ('c1', 'aud_new', 0, '{}')");
    expect(await all<{ n: number }>("SELECT COUNT(*) AS n FROM checks WHERE id = 'c1'")).toEqual([{ n: 2 }]);
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

  it("reconciles a fresh pack with an amendment, a shipment and separate work", async () => {
    const dir = path.resolve("Sverko_1_QA_2026-11-09");
    const names = [
      "01_Otchet_KP47.xlsx",
      "02_Zhurnal_rabot.xlsx",
      "03_Dogovor_KP47.docx",
      "04_Dopsoglashenie_1.docx",
      "05_Nakladnaya_147.pdf",
      "06_Akt_obucheniya_149.pdf",
      "07_Platezh_917.pdf",
    ];
    const docs = await Promise.all(names.map(async (name) => prepare(name, readFileSync(path.join(dir, name)), name.startsWith("01"))));
    const report = docs[0];
    if (!report) throw new Error("нет отчёта");
    const checks = byName(reconcile(report, docs.slice(1), []));
    expect(checks["Номер договора"]?.status).toBe("match");
    expect(checks["Поставщик"]?.status).toBe("match");
    expect(checks["Договорный срок поставки"]?.status).toBe("mismatch");
    expect(checks["Договорный срок поставки"]?.sourceValue).toContain("30.10.2026");
    expect(checks["Фактическая дата поставки"]?.status).toBe("match");
    expect(checks["Количество поставленных анализаторов АВ-10"]?.status).toBe("mismatch");
    expect(checks["Количество поставленных анализаторов АВ-10"]?.discrepancy).toBe("+2 шт.");
    expect(checks["Стоимость поставленных анализаторов АВ-10"]?.status).toBe("mismatch");
    expect(checks["Стоимость поставленных анализаторов АВ-10"]?.discrepancy).toBe("+36 000 ₽");
    expect(checks["Продолжительность обучения работе с оборудованием"]?.status).toBe("mismatch");
    expect(checks["Продолжительность обучения работе с оборудованием"]?.discrepancy).toBe("+2 час");
    expect(checks["Стоимость перевозки оборудования"]?.status).toBe("match");
    expect(checks["Оплачено по договору"]?.status).toBe("match");
    expect(checks["Гарантийный срок анализаторов АВ-10"]?.status).toBe("match");
    expect(checks["Ввод оборудования в эксплуатацию завершён"]?.status).toBe("not_found");
    expect(checks["Количество участников обучения"]?.status).toBe("match");
    const counts = { match: 0, mismatch: 0, not_found: 0, needs_review: 0 };
    for (const check of Object.values(checks)) counts[check.status as keyof typeof counts] += 1;
    expect(counts).toEqual({ match: 7, mismatch: 4, not_found: 1, needs_review: 0 });
  });
});
