// @vitest-environment node
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeDb, readSession } from "@/server/db";
import { evidenceFromFragment } from "@/server/evidence";
import { readFile } from "@/server/extract";
import { actPdf, supplyReport, waybill } from "@/server/fixtures";
import { handleApi } from "@/server/http";
import { enqueue } from "@/server/process";
import type { PreparedDoc } from "@/server/reconcile";
import { duplicateFileNames, formatNotice, parseNotices } from "@/lib/notices";
import { ru } from "@/i18n/messages/ru";

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

async function upload(cookie: string, title: string, report: Buffer, reportName: string, files: { name: string; bytes: Buffer }[]): Promise<string> {
  const form = new FormData();
  form.set("title", title);
  form.set("idempotencyKey", crypto.randomUUID());
  form.set("report", new File([new Uint8Array(report)], reportName), reportName);
  for (const file of files) form.append("supporting", new File([new Uint8Array(file.bytes)], file.name), file.name);
  const response = await handleApi(new Request("http://localhost/api/audits", { method: "POST", body: form, headers: { cookie } }));
  if (response.status !== 201) throw new Error(await response.text());
  return ((await response.json()) as { id: string }).id;
}

function counts(checks: { status: string }[]) {
  const tally = { match: 0, mismatch: 0, not_found: 0, needs_review: 0 };
  for (const check of checks) tally[check.status as keyof typeof tally] += 1;
  return tally;
}

describe("processSession contract", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env["AI_API_KEY"];
    delete process.env["AI_BASE_URL"];
    delete process.env["AI_MODEL"];
    delete process.env["SVERKO_SCAN_CHAR_LIMIT"];
    delete process.env["SVERKO_PRIVACY"];
    await closeDb();
  });

  it("keeps the KP-47 result when the model is absent and when it returns nothing", async () => {
    process.env["SVERKO_DATA_DIR"] = mkdtempSync(path.join(tmpdir(), "sverko-contract-"));
    await closeDb();
    const cookie = await signIn();
    const dir = path.resolve("Sverko_1_QA_2026-11-09");
    const pack = ["02_Zhurnal_rabot.xlsx", "03_Dogovor_KP47.docx", "04_Dopsoglashenie_1.docx", "05_Nakladnaya_147.pdf", "06_Akt_obucheniya_149.pdf", "07_Platezh_917.pdf"];
    const files = pack.map((name) => ({ name, bytes: readFileSync(path.join(dir, name)) }));
    const withoutKey = await upload(cookie, "КП-47 без ключа", readFileSync(path.join(dir, "01_Otchet_KP47.xlsx")), "01_Otchet_KP47.xlsx", files);
    await enqueue(withoutKey);
    const rules = await readSession(withoutKey);
    expect(counts(rules?.checks ?? [])).toEqual({ match: 7, mismatch: 4, not_found: 1, needs_review: 0 });
    expect(rules?.notices?.some((notice) => notice.code === "model_two_stage")).toBe(false);

    process.env["AI_API_KEY"] = "test-key";
    process.env["AI_BASE_URL"] = "https://model.test/v1";
    process.env["AI_MODEL"] = "test-model";
    process.env["SVERKO_PRIVACY"] = "off";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 })),
    );
    const emptyModel = await upload(cookie, "КП-47 пустая модель", readFileSync(path.join(dir, "01_Otchet_KP47.xlsx")), "01_Otchet_KP47.xlsx", files);
    await enqueue(emptyModel);
    const fallback = await readSession(emptyModel);
    expect(counts(fallback?.checks ?? [])).toEqual({ match: 7, mismatch: 4, not_found: 1, needs_review: 0 });
    expect(fallback?.notices?.some((notice) => notice.code === "model_two_stage")).toBe(false);
  }, 120_000);

  it("replaces the rule result when the model cites a real fragment, and keeps its page and box", async () => {
    process.env["SVERKO_DATA_DIR"] = mkdtempSync(path.join(tmpdir(), "sverko-model-"));
    await closeDb();
    const cookie = await signIn();
    process.env["AI_API_KEY"] = "test-key";
    process.env["AI_BASE_URL"] = "https://model.test/v1";
    process.env["AI_MODEL"] = "test-model";
    process.env["SVERKO_PRIVACY"] = "off";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
        const system = body.messages[0]?.content ?? "";
        const data = JSON.parse(body.messages[1]?.content ?? "{}") as {
          report?: { fragments?: { id: string; text: string }[] };
          sources?: { fragments?: { id: string; text: string }[] };
        };
        const reportFragment = data.report?.fragments?.[0];
        const source = data.sources?.fragments?.find((item) => item.text.length > 12);
        const content = system.includes("только отчёт") || !source
          ? { indicators: [{ name: "Контракт модели", reportValue: "1", reportFragmentId: reportFragment?.id ?? "", reportQuote: reportFragment?.text.slice(0, 24) ?? "1" }] }
          : {
              findings: [{
                name: "Контракт модели",
                reportValue: "1",
                reportFragmentId: reportFragment?.id ?? "",
                reportQuote: reportFragment?.text.slice(0, 24) ?? "1",
                sourceCount: 1,
                sources: `${source.id} | ${source.text.slice(0, 40)}`,
                relation: "same",
              }],
            };
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 });
      }),
    );
    const id = await upload(cookie, "Модель вместо правил", supplyReport(), "Отчет_поставка.xlsx", [{ name: "Акт_14.pdf", bytes: await actPdf("250 000,00 руб.", 1) }]);
    await enqueue(id);
    const session = await readSession(id);
    expect(session?.checks.map((check) => check.fieldName)).toEqual(["Контракт модели"]);
    expect(session?.notices?.some((notice) => notice.code === "model_two_stage")).toBe(true);
    const evidence = session?.checks[0]?.evidenceReferences[0];
    expect(evidence?.pageNumber).toBeGreaterThan(0);
    expect(evidence?.box).toBeTruthy();
    expect(evidence?.locationInDocument).toBeTruthy();
  });

  it("tells the reviewer when the model did not see the whole pack", async () => {
    process.env["SVERKO_DATA_DIR"] = mkdtempSync(path.join(tmpdir(), "sverko-cut-"));
    await closeDb();
    const cookie = await signIn();
    process.env["AI_API_KEY"] = "test-key";
    process.env["AI_BASE_URL"] = "https://model.test/v1";
    process.env["AI_MODEL"] = "test-model";
    process.env["SVERKO_PRIVACY"] = "off";
    process.env["SVERKO_SCAN_CHAR_LIMIT"] = "30";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ indicators: [{ name: "Количество", reportValue: "50 шт", reportFragmentId: "missing", reportQuote: "50" }], findings: [{ name: "Количество", reportValue: "50 шт", reportFragmentId: "missing", reportQuote: "50", sourceCount: 0, sources: "", relation: "missing" }] }) } }] }), { status: 200 })),
    );
    const id = await upload(cookie, "Обрезанный комплект", supplyReport(), "Отчет_поставка.xlsx", [{ name: "Накладная_34.xlsx", bytes: waybill("34", 47) }]);
    await enqueue(id);
    const session = await readSession(id);
    expect(session?.incomplete).toBe(true);
    expect(session?.notices?.some((notice) => notice.code === "context_truncated" && notice.limit === 30)).toBe(true);
    expect(formatNotice(session!.notices!.find((notice) => notice.code === "context_truncated")!, ru)).toContain("30");
  });

  it("copies a measured box and reads an old Russian notice", async () => {
    const act = await prepare("Акт_14.pdf", await actPdf("250 000,00 руб.", 1), false);
    const fragment = act.read.fragments.find((item) => item.box && item.pageNumber > 0);
    expect(fragment).toBeTruthy();
    const evidence = evidenceFromFragment([act], `${act.id}:${fragment!.id}`, fragment!.text.slice(0, 20));
    expect(evidence.pageNumber).toBe(fragment!.pageNumber);
    expect(evidence.box).toEqual(fragment!.box);
    expect(evidence.locationInDocument).toBe(fragment!.anchor);
    const stored = parseNotices(["«Акт.pdf» повторяет уже учтённый файл и не увеличивает суммы."]);
    expect(stored[0]?.code).toBe("legacy");
    expect(duplicateFileNames([{ code: "duplicate_file", name: "Акт.pdf" }])).toEqual(["Акт.pdf"]);
  });
});
