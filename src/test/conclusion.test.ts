import { describe, expect, it } from "vitest";
import { buildConclusion, computeRecommendation, computeStats } from "@/lib/conclusion";
import { demoDocuments, demoSession } from "@/mocks/demoAudit";

describe("demo audit rules", () => {
  it("has 12 checks: 7 match, 2 mismatch, 1 not found, 2 need review", () => {
    const s = computeStats(demoSession.checks);
    expect([s.total, s.matched, s.mismatches, s.notFound, s.needsReview]).toEqual([12, 7, 2, 1, 2]);
  });

  it("recommends returning the report for revision", () => {
    expect(buildConclusion(demoSession, demoDocuments).recommendation).toBe("revise");
  });

  it("marking a mismatch as verified keeps its original automatic status", () => {
    const checks = demoSession.checks.map((c) => (c.id === "c8" ? { ...c, reviewerStatus: "verified" as const } : c));
    expect(checks.find((c) => c.id === "c8")?.status).toBe("mismatch");
    expect(computeStats(checks).mismatches).toBe(2);
  });

  it("cost discrepancy highlights the 250 000 ₽ fragment in the act", () => {
    const c = demoSession.checks.find((x) => x.id === "c8")!;
    expect(c.sourceValue).toBe("250 000 ₽");
    expect(c.evidenceReferences[0].locationInDocument).toBe("act-cost");
  });

  it("recommends accept only when all blocking issues are verified and reviews done", () => {
    const checks = demoSession.checks.map((c) => (c.status === "match" ? c : { ...c, reviewerStatus: "verified" as const }));
    expect(computeRecommendation(checks)).toBe("accept");
  });
});
