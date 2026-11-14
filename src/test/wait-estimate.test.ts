import { describe, expect, it } from "vitest";
import { previewWait, visualPagesOf, waitBounds, waitSeconds } from "@/lib/waitEstimate";

describe("wait estimate", () => {
  it("grows with pages that still need recognition and with text already read", () => {
    const textOnly = waitSeconds({ pendingVisualPages: 0, pendingTextFiles: 1, textChars: 2_000, model: true, queued: false });
    const withScans = waitSeconds({ pendingVisualPages: 8, pendingTextFiles: 1, textChars: 2_000, model: true, queued: false });
    const moreText = waitSeconds({ pendingVisualPages: 0, pendingTextFiles: 0, textChars: 80_000, model: true, queued: false });
    const lessText = waitSeconds({ pendingVisualPages: 0, pendingTextFiles: 0, textChars: 1_000, model: true, queued: false });
    expect(withScans).toBeGreaterThan(textOnly);
    expect(moreText).toBeGreaterThan(lessText);
  });

  it("guesses at least one page for a pdf and one for a picture", () => {
    expect(visualPagesOf("scan.pdf", 50_000)).toBe(1);
    expect(visualPagesOf("photo.jpg", 2_000_000)).toBe(1);
    expect(visualPagesOf("table.xlsx", 80_000)).toBe(0);
    expect(visualPagesOf("card.pdf", 900_000, 6)).toBe(6);
    expect(previewWait([{ name: "a.pdf", size: 400_000 }, { name: "b.png", size: 100_000 }])).toBeGreaterThan(30);
    const tiny = previewWait([{ name: "note.xlsx", size: 20_000 }]);
    const mid = previewWait([{ name: "book.xlsx", size: 800_000 }]);
    const big = previewWait([{ name: "scan.pdf", size: 8_000_000 }]);
    expect(mid).toBeGreaterThan(tiny);
    expect(big).toBeGreaterThan(mid * 2);
    expect(waitBounds(tiny).kind).toBe("under");
    expect(waitBounds(big).kind).toBe("range");
  });

  it("turns seconds into a short range", () => {
    expect(waitBounds(20).kind).toBe("under");
    expect(waitBounds(90)).toEqual({ kind: "about", n: 2 });
    const range = waitBounds(400);
    expect(range.kind).toBe("range");
    if (range.kind === "range") expect(range.high).toBeGreaterThan(range.low);
  });
});
