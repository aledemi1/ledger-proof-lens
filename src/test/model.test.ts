// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { aiConfig } from "@/server/env";
import { readFile } from "@/server/extract";
import { laptopActPdf, laptopReport, laptopWaybill } from "@/server/fixtures";
import { classifyLabels } from "@/server/llm";
import { reconcile, unknownLabels, type PreparedDoc, type RoleHints } from "@/server/reconcile";

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
  afterEach(() => vi.unstubAllGlobals());

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
    expect(qty?.explanation).toContain("Языковая модель определила смысл подписи");
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
