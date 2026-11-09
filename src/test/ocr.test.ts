// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { linesFromOcrPayload, recognizeImage, recognizeUploadedImage, setPrimaryOcrForTests } from "@/server/extract/ocr";

describe("local OCR", () => {
  afterEach(() => {
    setPrimaryOcrForTests(null);
  });

  it("reads uploaded png and jpeg locally and does not call an external model", async () => {
    setPrimaryOcrForTests(async () => [{ text: "Локальная строка" }]);
    const png = await recognizeUploadedImage(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 20, 10, "image/png");
    const jpeg = await recognizeUploadedImage(Buffer.from([0xff, 0xd8, 0xff]), 20, 10, "image/jpeg");
    expect(png.engine).toBe("tesseract");
    expect(jpeg.lines).toEqual([{ text: "Локальная строка" }]);
  });

  it("reads lines from a model payload without inventing coordinates", () => {
    expect(linesFromOcrPayload('```json\n{"lines":["Акт № 15","1 000,00"]}\n```')).toEqual(["Акт № 15", "1 000,00"]);
  });

  it("does not send the image out when local recognition fails", async () => {
    setPrimaryOcrForTests(async () => {
      throw new Error("распознаватель не запустился");
    });
    await expect(recognizeImage(Buffer.from("image"), 20, 10, "image/png")).rejects.toThrow(/не отправляется/);
  });

  it("queues a second image behind the local recognizer", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    setPrimaryOcrForTests(async () => {
      calls += 1;
      if (calls === 1) await gate;
      return [{ text: calls === 1 ? "первый" : "второй" }];
    });
    const first = recognizeImage(Buffer.from("a"), 10, 10);
    await new Promise((resolve) => setTimeout(resolve, 20));
    let secondDone = false;
    const second = recognizeImage(Buffer.from("b"), 10, 10).then((result) => {
      secondDone = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(secondDone).toBe(false);
    release();
    const [primary, queued] = await Promise.all([first, second]);
    expect(primary.lines[0]?.text).toBe("первый");
    expect(queued.lines[0]?.text).toBe("второй");
    expect(queued.engine).toBe("tesseract");
  });
});
