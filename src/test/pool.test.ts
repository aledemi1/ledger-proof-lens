import { describe, expect, it } from "vitest";
import { createLimiter } from "@/server/pool";

describe("work limiter", () => {
  it("runs no more jobs than the limit", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    const jobs = Array.from({ length: 6 }, () =>
      limit(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
      }),
    );
    await Promise.all(jobs);
    expect(peak).toBe(2);
  });
});
