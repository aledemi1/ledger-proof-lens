// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { closeDb } from "@/server/db";
import { supplyReport, waybill } from "@/server/fixtures";
import { handleApi } from "@/server/http";
import { enqueue } from "@/server/process";
import type { CheckResult } from "@/types/audit";

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

async function upload(cookie: string): Promise<string> {
  const form = new FormData();
  form.set("title", "Правка отчёта");
  form.set("idempotencyKey", crypto.randomUUID());
  form.set("report", new File([new Uint8Array(supplyReport())], "Отчет.xlsx"), "Отчет.xlsx");
  form.append("supporting", new File([new Uint8Array(waybill("34", 47))], "Накладная.xlsx"), "Накладная.xlsx");
  form.append("supporting", new File([new Uint8Array(Buffer.from("%PDF-1.4\nbroken"))], "битый.pdf"), "битый.pdf");
  const response = await handleApi(new Request("http://localhost/api/audits", { method: "POST", body: form, headers: { cookie } }));
  if (response.status !== 201) throw new Error(await response.text());
  return ((await response.json()) as { id: string }).id;
}

async function sessionOf(cookie: string, id: string): Promise<{ checks: CheckResult[]; processingStage: string; notices?: { code: string }[] }> {
  const response = await handleApi(new Request(`http://localhost/api/audits/${id}`, { headers: { cookie } }));
  return response.json() as Promise<{ checks: CheckResult[]; processingStage: string; notices?: { code: string }[] }>;
}

async function waitDone(cookie: string, id: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const session = await sessionOf(cookie, id);
    if (session.processingStage === "done" || session.processingStage === "failed") return session;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("проверка не завершилась");
}

describe("audit actions", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env["AI_API_KEY"];
    delete process.env["AI_BASE_URL"];
    delete process.env["AI_MODEL"];
    delete process.env["SVERKO_PRIVACY"];
    await closeDb();
  });

  it("revises a report cell, exports the edited workbook, and adds a document", async () => {
    process.env["SVERKO_DATA_DIR"] = mkdtempSync(path.join(tmpdir(), "sverko-actions-"));
    await closeDb();
    const cookie = await signIn();
    const id = await upload(cookie);
    await enqueue(id);
    const ready = await sessionOf(cookie, id);
    const quantity = ready.checks.find((check) => check.fieldName === "Количество");
    expect(quantity).toBeTruthy();
    const before = ready.checks.map((check) => check.id);

    const empty = await handleApi(new Request(`http://localhost/api/audits/${id}/checks/${quantity!.id}/report-value`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ value: "  " }),
    }));
    expect(empty.status).toBe(400);
    const missing = await handleApi(new Request(`http://localhost/api/audits/${id}/checks/missing/report-value`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ value: "47 шт" }),
    }));
    expect(missing.status).toBe(404);

    const unparsed = await handleApi(new Request(`http://localhost/api/audits/${id}/checks/${quantity!.id}/report-value`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ value: "не число" }),
    }));
    expect(unparsed.status).toBe(200);
    const unparsedBody = (await unparsed.json()) as CheckResult;
    expect(unparsedBody.status).toBe("needs_review");
    expect(unparsedBody.explanation).toEqual(expect.arrayContaining([expect.objectContaining({ code: "edited_unparsed" })]));

    const revised = await handleApi(new Request(`http://localhost/api/audits/${id}/checks/${quantity!.id}/report-value`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ value: "47 шт" }),
    }));
    expect(revised.status).toBe(200);
    const revisedBody = (await revised.json()) as CheckResult;
    expect(revisedBody.status).toBe("match");
    expect(revisedBody.reportEdited).toBe(true);
    expect(revisedBody.explanation).toEqual(expect.arrayContaining([expect.objectContaining({ code: "edited_match" })]));
    expect(ready.checks.find((check) => check.id === quantity!.id)?.status).not.toBe(revisedBody.status);

    const documents = (await (await handleApi(new Request(`http://localhost/api/audits/${id}/documents`, { headers: { cookie } }))).json()) as { id: string; name: string }[];
    const report = documents.find((document) => document.name === "Отчет.xlsx");
    expect(report).toBeTruthy();
    const file = await handleApi(new Request(`http://localhost/api/audits/${id}/files/${report!.id}?revised=1`, { headers: { cookie } }));
    expect(file.status).toBe(200);
    expect(decodeURIComponent(file.headers.get("Content-Disposition") ?? "")).toContain("правки.xlsx");
    const book = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
    const address = revisedBody.reportReference?.locationLabel?.match(/ячейка\s+([A-Z]+\d+)/i)?.[1];
    expect(address).toBeTruthy();
    expect(book.Sheets["Отчёт"]?.[address!]?.v).toBe("47 шт");

    const edited = await sessionOf(cookie, id);
    const mismatch = edited.checks.find((check) => check.status === "mismatch");
    expect(mismatch).toBeTruthy();
    const blocked = await handleApi(new Request(`http://localhost/api/audits/${id}/checks/${mismatch!.id}/review`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ reviewerStatus: "verified", reviewerComment: "" }),
    }));
    expect(blocked.status).toBe(400);
    const verified = await handleApi(new Request(`http://localhost/api/audits/${id}/checks/${mismatch!.id}/review`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ reviewerStatus: "verified", reviewerComment: "Сверено по накладной" }),
    }));
    expect(verified.status).toBe(200);
    expect(((await verified.json()) as CheckResult).status).toBe("mismatch");
    const unknown = await handleApi(new Request(`http://localhost/api/audits/${id}/decision`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ decision: "later" }),
    }));
    expect(unknown.status).toBe(400);
    const accepted = await handleApi(new Request(`http://localhost/api/audits/${id}/decision`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept", comment: "После правки количества" }),
    }));
    expect(accepted.status).toBe(200);
    const reset = await handleApi(new Request(`http://localhost/api/audits/${id}/reviews/reset`, { method: "POST", headers: { cookie } }));
    expect(reset.status).toBe(200);

    const noFile = await handleApi(new Request(`http://localhost/api/audits/${id}/documents`, { method: "POST", body: new FormData(), headers: { cookie } }));
    expect(noFile.status).toBe(400);
    const bad = new FormData();
    bad.append("supporting", new File([Buffer.from("текст")], "заметка.txt"), "заметка.txt");
    const rejected = await handleApi(new Request(`http://localhost/api/audits/${id}/documents`, { method: "POST", body: bad, headers: { cookie } }));
    expect(rejected.status).toBe(400);

    const extra = new FormData();
    extra.append("supporting", new File([new Uint8Array(waybill("99", 3))], "Дополнение.xlsx"), "Дополнение.xlsx");
    const added = await handleApi(new Request(`http://localhost/api/audits/${id}/documents`, { method: "POST", body: extra, headers: { cookie } }));
    expect(added.status).toBe(200);
    const done = await waitDone(cookie, id);
    expect(done.processingStage).toBe("done");
    const names = (await (await handleApi(new Request(`http://localhost/api/audits/${id}/documents`, { headers: { cookie } }))).json()) as { name: string }[];
    expect(names.map((document) => document.name)).toContain("Дополнение.xlsx");
    expect(done.checks.map((check) => check.id)).toEqual(expect.arrayContaining(before));
  });

  it("adds a selected indicator without changing the rows already checked", async () => {
    process.env["SVERKO_DATA_DIR"] = mkdtempSync(path.join(tmpdir(), "sverko-pick-"));
    await closeDb();
    const cookie = await signIn();
    const id = await upload(cookie);
    await enqueue(id);
    const ready = await sessionOf(cookie, id);
    const ids = ready.checks.map((check) => check.id);

    const missing = await handleApi(new Request(`http://localhost/api/audits/${id}/indicators`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ text: "" }),
    }));
    expect(missing.status).toBe(400);

    const manual = await handleApi(new Request(`http://localhost/api/audits/${id}/indicators`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ text: "Отдельная строка", anchor: "r-missing" }),
    }));
    expect(manual.status).toBe(201);
    const manualBody = (await manual.json()) as CheckResult;
    expect(manualBody.status).toBe("not_found");
    expect(manualBody.explanation).toEqual([{ code: "selected_missing", text: "Отдельная строка" }]);
    expect(manualBody.reportReference?.locationInDocument).toBe("r-missing");

    process.env["AI_API_KEY"] = "test-key";
    process.env["AI_BASE_URL"] = "https://model.test/v1";
    process.env["AI_MODEL"] = "test-model";
    process.env["SVERKO_PRIVACY"] = "off";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
      const data = JSON.parse(body.messages[1]?.content ?? "{}") as { sources?: { fragments?: { id: string; text: string }[] } };
      const source = data.sources?.fragments?.find((fragment) => fragment.text.includes("Сервер"));
      const quote = source?.text.slice(0, 48) ?? "Сервер";
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        findings: [{ name: "Сервер Dell PowerEdge", reportValue: "Сервер Dell PowerEdge", reportFragmentId: "", reportQuote: quote, sourceCount: 1, sources: `${source?.id ?? ""} | ${quote}`, relation: "same" }],
      }) } }] }), { status: 200 });
    }));
    const picked = await handleApi(new Request(`http://localhost/api/audits/${id}/indicators`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ text: "Сервер Dell PowerEdge" }),
    }));
    expect(picked.status).toBe(201);
    const pickedBody = (await picked.json()) as CheckResult;
    expect(pickedBody.explanation).toEqual(expect.arrayContaining([expect.objectContaining({ code: "selected_found" })]));
    const after = await sessionOf(cookie, id);
    expect(after.checks.map((check) => check.id)).toEqual(expect.arrayContaining([...ids, manualBody.id, pickedBody.id]));
    expect(after.checks.find((check) => check.id === ids[0])?.status).toBe(ready.checks[0]?.status);
  });
});
