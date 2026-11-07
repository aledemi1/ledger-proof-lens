import { describe, expect, it } from "vitest";
import { buildConclusion, computeRecommendation, computeStats } from "@/lib/conclusion";
import { demoDocuments, demoSession } from "@/mocks/demoAudit";

describe("demo audit rules", () => {
  it("has 10 checks: 5 match, 4 mismatch, 1 not found", () => {
    const s = computeStats(demoSession.checks);
    expect([s.total, s.matched, s.mismatches, s.notFound, s.needsReview]).toEqual([10, 5, 4, 1, 0]);
  });

  it("recommends returning the report for revision", () => {
    expect(buildConclusion(demoSession, demoDocuments).recommendation).toBe("revise");
  });

  it("marking a mismatch as verified keeps its original automatic status", () => {
    const target = demoSession.checks.find((c) => c.status === "mismatch");
    const checks = demoSession.checks.map((c) => (c.id === target?.id ? { ...c, reviewerStatus: "verified" as const } : c));
    expect(checks.find((c) => c.id === target?.id)?.status).toBe("mismatch");
    expect(computeStats(checks).mismatches).toBe(4);
  });

  it("cost discrepancy points at the extracted act fragment", () => {
    const c = demoSession.checks.find((x) => x.fieldName === "Стоимость поставки");
    expect(c?.status).toBe("mismatch");
    expect(c?.discrepancy).toBe("+322 000 ₽");
    expect(c?.evidenceReferences[0]?.locationInDocument).toBeTruthy();
    expect(c?.evidenceReferences.some((item) => item.documentId === "doc-act")).toBe(true);
  });

  it("recommends accept only when all blocking issues are verified and reviews done", () => {
    const checks = demoSession.checks.map((c) => (c.status === "match" ? c : { ...c, reviewerStatus: "verified" as const }));
    expect(computeRecommendation(checks)).toBe("accept");
  });
});
