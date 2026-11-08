// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { linesFromOcrPayload, recognizeImage, recognizeUploadedImage, setPrimaryOcrForTests, UPLOADED_IMAGE_MODEL } from "@/server/extract/ocr";

describe("fallback OCR", () => {
  afterEach(() => {
    setPrimaryOcrForTests(null);
    vi.unstubAllGlobals();
    delete process.env["AI_API_KEY"];
    delete process.env["AI_BASE_URL"];
    delete process.env["AI_OCR_MODEL"];
  });

  it("sends png and jpeg uploads to gpt-5.4 and does not call Tesseract", async () => {
    process.env["AI_API_KEY"] = "test-key";
    process.env["AI_BASE_URL"] = "https://example.test/v1";
    process.env["AI_OCR_MODEL"] = "other-model";
    let tesseractCalled = false;
    setPrimaryOcrForTests(async () => {
      tesseractCalled = true;
      return [{ text: "не должно использоваться" }];
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"lines":["Рукописная строка"]}' } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const png = await recognizeUploadedImage(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 20, 10, "image/png");
    const jpeg = await recognizeUploadedImage(Buffer.from([0xff, 0xd8, 0xff]), 20, 10, "image/jpeg");
    expect(tesseractCalled).toBe(false);
    expect(png.engine).toBe("model");
    expect(jpeg.lines).toEqual([{ text: "Рукописная строка" }]);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const models = calls.map((call) => (JSON.parse(String(call[1]?.body)) as { model: string }).model);
    expect(models).toEqual([UPLOADED_IMAGE_MODEL, UPLOADED_IMAGE_MODEL]);
  });

  it("reads lines from a model payload without inventing coordinates", () => {
    expect(linesFromOcrPayload('```json\n{"lines":["Акт № 15","1 000,00"]}\n```')).toEqual(["Акт № 15", "1 000,00"]);
  });

  it("uses the vision model when the primary recognizer fails", async () => {
    process.env["AI_API_KEY"] = "test-key";
    process.env["AI_BASE_URL"] = "https://example.test/v1";
    process.env["AI_OCR_MODEL"] = "vision-test";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"lines":["Дозатор ДЭ-100"]}' } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    setPrimaryOcrForTests(async () => {
      throw new Error("распознаватель не запустился");
    });
    const result = await recognizeImage(Buffer.from("image"), 20, 10, "image/png");
    expect(result.engine).toBe("model");
    expect(result.lines).toEqual([{ text: "Дозатор ДЭ-100" }]);
    expect(result.lines[0]?.box).toBeUndefined();
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const body = JSON.parse(String(calls[0]?.[1]?.body)) as { model: string };
    expect(body.model).toBe("vision-test");
  });

  it("sends a second image to the model while the primary recognizer is busy", async () => {
    process.env["AI_API_KEY"] = "test-key";
    process.env["AI_BASE_URL"] = "https://example.test/v1";
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"lines":["запасной"]}' } }] }), { status: 200 })));
    setPrimaryOcrForTests(async () => {
      await gate;
      return [{ text: "основной" }];
    });
    const first = recognizeImage(Buffer.from("a"), 10, 10);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await recognizeImage(Buffer.from("b"), 10, 10);
    release();
    const primary = await first;
    expect(primary.engine).toBe("tesseract");
    expect(primary.lines[0]?.text).toBe("основной");
    expect(second.engine).toBe("model");
    expect(second.lines[0]?.text).toBe("запасной");
  });
});
