import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { readFile } from "../src/server/extract/index";
import { reconcile, type PreparedDoc } from "../src/server/reconcile";
import { normText, parseDecimal, parseDate } from "../src/server/values";

const root = "Sverko_Полный_комплект";
const reportName = "01_Отчет_октябрь_2025.xlsx";

async function prepare(file: string, isReport: boolean): Promise<PreparedDoc> {
  console.log("read", path.basename(file));
  const buffer = readFileSync(file);
  const read = await readFile(path.basename(file), buffer);
  return { id: path.basename(file), name: path.basename(file), sha256: path.basename(file), read, isReport };
}

function numberOf(value: string): bigint | null {
  const cleaned = value.replace(/[₽руб.\s]/gi, "");
  return parseDecimal(cleaned);
}

const report = await prepare(path.join(root, "01_Отчет", reportName), true);
const supporting = [];
for (const name of readdirSync(path.join(root, "02_Первичные_документы"))) {
  supporting.push(await prepare(path.join(root, "02_Первичные_документы", name), false));
}
const checks = reconcile(report, supporting, []);
console.log("checks", checks.length, "by status", {
  match: checks.filter((c) => c.status === "match").length,
  mismatch: checks.filter((c) => c.status === "mismatch").length,
  not_found: checks.filter((c) => c.status === "not_found").length,
  needs_review: checks.filter((c) => c.status === "needs_review").length,
});

const rows = XLSX.utils.sheet_to_json<{ [k: string]: string }>(XLSX.readFile(path.join(root, "03_Эталон_не_загружать/Ожидаемые_результаты.xlsx")).Sheets["Эталон"], { range: 6, raw: false, defval: "" });
const statusMap: Record<string, string> = { Совпадает: "match", Расхождение: "mismatch", "Не найдено подтверждение": "not_found", "Требует проверки": "needs_review" };
let ok = 0;
for (const row of rows) {
  const name = row["Показатель"] ?? "";
  const expected = statusMap[row["Результат"] ?? ""] ?? row["Результат"];
  const check = checks.find((item) => normText(item.fieldName).includes(normText(name)) || normText(name).includes(normText(item.fieldName)));
  const reportNum = numberOf(row["В отчете"] ?? "");
  const expectNum = numberOf(row["Ожидается"] ?? "");
  const gotNum = check ? numberOf(check.reportValue) : null;
  const sourceNum = check?.sourceValue ? numberOf(check.sourceValue) : null;
  const statusOk = check?.status === expected;
  const valueOk = reportNum == null || (gotNum != null && gotNum === reportNum);
  const sourceOk = expectNum == null || expected === "not_found" || expected === "needs_review" || (sourceNum != null && sourceNum === expectNum);
  const dateOk = !parseDate(row["Ожидается"] ?? "") || check?.sourceValue?.includes(row["Ожидается"] ?? "") || check?.status === expected;
  const good = Boolean(check) && statusOk && valueOk && (sourceOk || dateOk);
  if (good) ok += 1;
  else console.log(`${row["ID"]} ${expected} got ${check?.status ?? "—"} | ${name} | report ${row["В отчете"]} | expect ${row["Ожидается"]} | source ${check?.sourceValue ?? "—"} | ${check?.fieldName ?? ""}`);
}
console.log(`etalon ${ok}/${rows.length}`);
