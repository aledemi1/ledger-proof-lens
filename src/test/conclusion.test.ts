import { describe, expect, it } from "vitest";
import { buildConclusion, computeRecommendation, computeStats } from "@/lib/conclusion";
import { demoDocuments, demoSession } from "@/mocks/demoAudit";

describe("demo audit rules", () => {
  it("shows the laboratory pack, not a hand-written example", () => {
    expect(demoDocuments.map((doc) => doc.name)).toContain("01_Отчет_октябрь_2025.xlsx");
    expect(demoDocuments).toHaveLength(27);
    const contract = demoSession.checks.find((check) => check.fieldName === "Номер договора");
    expect(contract?.status).toBe("match");
    expect(contract?.reportValue).toBe("СЛ-16/2025");
    const stats = computeStats(demoSession.checks);
    expect(stats.mismatches).toBeGreaterThan(0);
  });

  it("recommends returning the report for revision", () => {
    expect(buildConclusion(demoSession, demoDocuments).recommendation).toBe("revise");
  });

  it("marking a mismatch as verified keeps its original automatic status", () => {
    const target = demoSession.checks.find((c) => c.status === "mismatch");
    const mismatches = demoSession.checks.filter((c) => c.status === "mismatch").length;
    const checks = demoSession.checks.map((c) => (c.id === target?.id ? { ...c, reviewerStatus: "verified" as const } : c));
    expect(checks.find((c) => c.id === target?.id)?.status).toBe("mismatch");
    expect(computeStats(checks).mismatches).toBe(mismatches);
  });

  it("a discrepancy points at evidence from the pack", () => {
    const c = demoSession.checks.find((x) => x.status === "mismatch" && x.discrepancy);
    expect(c?.evidenceReferences.length).toBeGreaterThan(0);
    expect(demoDocuments.some((doc) => doc.id === c?.evidenceReferences[0]?.documentId)).toBe(true);
  });

  it("recommends accept only when all blocking issues are verified and reviews done", () => {
    const checks = demoSession.checks.map((c) => (c.status === "match" ? c : { ...c, reviewerStatus: "verified" as const }));
    expect(computeRecommendation(checks)).toBe("accept");
  });
});
