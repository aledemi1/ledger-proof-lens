import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { readFile } from "../src/server/extract/index";
import { reconcile, type PreparedDoc } from "../src/server/reconcile";

const folder = path.resolve(process.argv[2] ?? "public/demo/lab/en");
const names = readdirSync(folder).filter((name) => !name.startsWith(".") && statSync(path.join(folder, name)).isFile());
const reportName = names.find((name) => name.startsWith("01_")) ?? names[0];
if (!reportName) throw new Error("empty folder");

async function prepare(name: string, isReport: boolean): Promise<PreparedDoc> {
  const read = await readFile(name, readFileSync(path.join(folder, name)));
  return { id: name, name, sha256: name, read, isReport };
}

const report = await prepare(reportName, true);
const supporting: PreparedDoc[] = [];
for (const name of names.filter((item) => item !== reportName).sort()) supporting.push(await prepare(name, false));
const checks = reconcile(report, supporting, []);
const counts = { match: 0, mismatch: 0, not_found: 0, needs_review: 0, checks: checks.length };
for (const check of checks) counts[check.status] += 1;
console.log(JSON.stringify(counts));
