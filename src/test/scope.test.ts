// @vitest-environment node
import { describe, expect, it } from "vitest";
import { documentFacts, exclusionReason, gatherParts, sameRow, scopeOf } from "@/server/llm/scope";
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
  });

  it("treats a row total as the same row as its articles", () => {
    expect(sameRow("Итого — 3 этап, 2026 г.", "Оплата труда — 3 этап, 2026 г.")).toBe(true);
    expect(sameRow("Итого — 3 этап, 2026 г.", "Оплата труда — 2 этап, 2025 г.")).toBe(false);
  });
});
