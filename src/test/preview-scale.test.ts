import { describe, expect, it } from "vitest";
import { imagePreviewWidth, pdfPreviewScale } from "@/lib/previewScale";

describe("preview scale", () => {
  it("draws a landscape page at two CSS pixels per point instead of shrinking it", () => {
    expect(pdfPreviewScale(842, 595, 1, 2)).toBe(2);
    expect(pdfPreviewScale(842, 595, 1, 1)).toBe(2);
  });

  it("stops growing a wide page once the bitmap would pass the edge cap", () => {
    const scale = pdfPreviewScale(1191, 842, 2.4, 2);
    expect(scale).toBeLessThan(2.4 * 2);
    expect(Math.max(1191, 842) * scale * 2).toBeLessThanOrEqual(4500);
  });

  it("shows an image at one file pixel per screen pixel", () => {
    expect(imagePreviewWidth(4000, 1, 2)).toBe(2000);
    expect(imagePreviewWidth(4000, 1, 1)).toBe(4000);
    expect(imagePreviewWidth(920, 1.4, 1)).toBe(1288);
  });
});