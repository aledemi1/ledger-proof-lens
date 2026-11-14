import { describe, expect, it } from "vitest";
import { bareRowIndex, indicatorPicks } from "@/server/regions";

const fragments = [
  { id: "doc:r1", anchor: "a1", text: "1" },
  { id: "doc:r2", anchor: "a2", text: "СЛ-16/2025" },
  { id: "doc:r3", anchor: "a3", text: "1,842,960.00" },
  { id: "doc:r4", anchor: "a4", text: "20" },
];

describe("indicator picks", () => {
  it("keeps the fragment the model cited and drops a bare row number", () => {
    const picks = indicatorPicks(fragments, [
      { name: "1", value: "1", fragmentId: "doc:r1" },
      { name: "Договор", value: "СЛ-16/2025", fragmentId: "doc:r2" },
      { name: "Сумма", value: "1,842,960.00", fragmentId: "doc:r3" },
      { name: "Количество датчиков", value: "20", fragmentId: "doc:r4" },
    ]);
    expect(picks.map((item) => item.anchor)).toEqual(["a2", "a3", "a4"]);
    expect(bareRowIndex("12")).toBe(true);
    expect(bareRowIndex("1,842,960.00")).toBe(false);
  });

  it("does not pull in a short cell just because its digit appears in another value", () => {
    const picks = indicatorPicks(fragments, [
      { name: "Сумма", value: "1,842,960.00", fragmentId: "doc:r3" },
    ]);
    expect(picks).toEqual([{ anchor: "a3", name: "Сумма", value: "1,842,960.00" }]);
  });
});
