// @vitest-environment node
import { describe, expect, it } from "vitest";
import { directComponents, documentFacts, exclusionReason, gatherParts, isRowTotal, partitionRow, sameRow, scopeOf } from "@/server/llm/scope";
import { parseMoney } from "@/server/values";
import type { PreparedDoc } from "@/server/reconcile";

describe("report scope", () => {
  it("reads a month range and the contract written in the report", () => {
    const scope = scopeOf("Карточка. Август 2025 г. — Май 2026 г. Контракт 24/03/15-01. Окончание 30 мая 2026 г.");
    expect(scope.start).toBe("2025-08-01");
    expect(scope.end).toBe("2026-05-31");
    expect(scope.contracts).toContain("24/03/15-01");
  });

  it("keeps a document inside the period and drops one after it or under another contract", () => {
    const scope = scopeOf("Август 2025 — Май 2026. Договор 24/03/15-01");
    expect(exclusionReason(documentFacts("Проект: 24/03/15-01. Период: Январь 2026. Начислено 333 000,00"), scope)).toBeNull();
    expect(exclusionReason(documentFacts("Договор 24/03/15-01. Дата 03.06.2026. Сумма 165 000,00"), scope)).toBe("вне периода");
    expect(exclusionReason(documentFacts("Договор: 24/03/16-02. Дата: 15.05.2026. Сумма 98 000,00"), scope)).toBe("другой договор");
  });

  it("pairs a header row with the value row and keeps the matching column", () => {
    const doc = {
      id: "doc",
      name: "Взносы январь.xlsx",
      sha256: "x",
      isReport: false,
      read: {
        fragments: [
          { id: "p", text: "Проект: 24/03/15-01 | Период: Январь 2026", pageNumber: 0, locationLabel: "P", anchor: "p", shape: "title" as const },
          { id: "h1", text: "База начислений, руб.", pageNumber: 0, locationLabel: "H", anchor: "h1", shape: "title" as const },
          { id: "h2", text: "Начислено взносов, руб.", pageNumber: 0, locationLabel: "H", anchor: "h2", shape: "title" as const },
          { id: "v1", text: "1,110,000.00", pageNumber: 0, locationLabel: "V", anchor: "v1", shape: "title" as const },
          { id: "v2", text: "333,000.00", pageNumber: 0, locationLabel: "V", anchor: "v2", shape: "title" as const },
        ],
        preview: { kind: "grid" as const, sheets: [] },
        pageCount: 1,
        text: "",
        warnings: [],
      },
    } satisfies PreparedDoc;
    const parts = gatherParts("Страховые взносы", "1 671 359,96", [doc]);
    expect(parts.map((part) => part.quote)).toEqual(["333,000.00"]);
    expect(gatherParts("Страховые взносы, всего", "1 671 359,96", [doc]).map((part) => part.quote)).toEqual(["333,000.00"]);
    expect(gatherParts("Итого — 3 этап, 2026 г.", "11 580 377,40", [doc])).toEqual([]);
    expect(gatherParts("Взносы, счет 213, всего", "1 578 126,37", [doc])).toEqual([]);
  });

  it("treats a row total as the same row as its articles", () => {
    expect(sameRow("Итого — 3 этап, 2026 г.", "Оплата труда — 3 этап, 2026 г.")).toBe(true);
    expect(sameRow("Итого — 3 этап, 2026 г.", "Оплата труда — 2 этап, 2025 г.")).toBe(false);
  });

  it("builds a row total from article totals and leaves out splits of those articles", () => {
    const money = (raw: string) => {
      const value = parseMoney(raw);
      if (value == null) throw new Error(raw);
      return value;
    };
    const part = (name: string, report: string, source: string) => ({ name, report: money(report), source: money(source) });
    const parts = [
        part("оплата труда", "5 558 474,83", "5 558 474,83"),
        part("зарплата", "5 248 019,04", "7 230 237,79"),
        part("резерв", "310 455,79", "100 000,00"),
        part("взносы", "1 671 359,96", "1 671 359,96"),
        part("взносы с зарплаты", "1 578 126,37", "7 230 237,79"),
        part("взносы с резерва", "93 233,59", "100 000,00"),
        part("общепроизводственные", "1 145 798,10", "1 133 298,10"),
        part("общехозяйственные", "3 204 744,51", "3 204 744,51"),
    ];
    const chosen = directComponents(parts, money("11 580 377,40"));
    const dropped = partitionRow(parts, money("11 580 377,40")).splits;
    expect(chosen?.map((item) => item.name).sort()).toEqual(["взносы", "общепроизводственные", "общехозяйственные", "оплата труда"]);
    expect(chosen?.reduce((sum, item) => sum + item.source, 0n)).toBe(money("11 567 877,40"));
    expect(dropped.map((item) => item.name).sort()).toEqual(["взносы с зарплаты", "взносы с резерва", "зарплата", "резерв"]);
    expect(isRowTotal("3 этап, 2026 г. — итого")).toBe(true);
    expect(isRowTotal("3 этап, 2026 г. — страховые взносы, всего")).toBe(false);
    expect(isRowTotal("Итого подтверждённых расходов")).toBe(false);
  });
});
