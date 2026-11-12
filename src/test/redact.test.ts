// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "@/server/extract";
import { setPrimaryOcrForTests } from "@/server/extract/ocr";
import { coversFor, paintPage } from "@/server/extract/redact";
import { actPdf } from "@/server/fixtures";
import { chatJson } from "@/server/llm/chat";

afterEach(() => {
  setPrimaryOcrForTests(null);
  vi.unstubAllGlobals();
  delete process.env["SVERKO_PRIVACY"];
});

function whitePng(width: number, height: number): Buffer {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  return canvas.toBuffer("image/png");
}

describe("page redaction", () => {
  it("covers a name that spans two words with one label", () => {
    const covers = coversFor(
      [
        { text: "ИНН", box: { x: 0, y: 0, width: 0.1, height: 0.1 } },
        { text: "Иванов", box: { x: 0.2, y: 0, width: 0.2, height: 0.1 } },
        { text: "Иван", box: { x: 0.42, y: 0, width: 0.15, height: 0.1 } },
      ],
      { version: 1, labels: { "{{PERSON_1}}": { type: "PERSON", original: "Иванов Иван", key: "иванов иван", n: 1 } } },
    );
    expect(covers.map((cover) => cover.token)).toEqual(["{{PERSON_1}}"]);
    expect(covers[0]?.box.x).toBeCloseTo(0.2);
    expect(covers[0]?.box.width).toBeCloseTo(0.37);
  });

  it("paints the word and writes the label in another color", async () => {
    const painted = await paintPage(whitePng(200, 80), 200, 80, [
      { text: "7707083893", box: { x: 0.1, y: 0.25, width: 0.55, height: 0.4 } },
    ], { version: 1, labels: { "{{INN_1}}": { type: "INN", original: "7707083893", key: "7707083893", n: 1 } } });
    const image = await loadImage(painted);
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const box = context.getImageData(20, 20, 120, 40).data;
    let dark = 0;
    let light = 0;
    for (let index = 0; index < box.length; index += 4) {
      const red = box[index] ?? 0;
      if (red < 40) dark += 1;
      if (red > 200) light += 1;
    }
    expect(dark).toBeGreaterThan(20);
    expect(light).toBeGreaterThan(5);
    const outside = context.getImageData(0, 0, 1, 1).data;
    expect(outside[0]).toBeGreaterThan(200);
  });

  it("sends the painted page and the same label in the text", async () => {
    let body = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      body = String(init?.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), { status: 200 });
    }));
    await chatJson(
      { baseUrl: "https://model.test/v1", apiKey: "test", model: "test-model" },
      "system",
      { inn: "7707083893" },
      5_000,
      [{ name: "card.pdf", pageNumber: 1, image: whitePng(200, 80), width: 200, height: 80, words: [{ text: "7707083893", box: { x: 0.1, y: 0.25, width: 0.55, height: 0.4 } }] }],
    );
    const content = (JSON.parse(body) as { messages: { content: { type: string; text?: string; image_url?: { url: string } }[] }[] }).messages[1]?.content;
    expect(Array.isArray(content)).toBe(true);
    const text = content?.filter((part) => part.type === "text").map((part) => part.text).join(" ");
    expect(text).toContain("{{INN_1}}");
    expect(text).not.toContain("7707083893");
    const url = content?.find((part) => part.type === "image_url")?.image_url?.url ?? "";
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("reads a pdf by recognition even when the text layer is long", async () => {
    setPrimaryOcrForTests(async () => [{
      text: "Итого 5 558 474,83",
      box: { x: 0.1, y: 0.2, width: 0.4, height: 0.05 },
      tokens: [{ text: "5 558 474,83", box: { x: 0.2, y: 0.2, width: 0.3, height: 0.05 } }],
    }]);
    const doc = await readFile("card.pdf", await actPdf("250 000,00 руб.", 1));
    expect(doc.text).toContain("5 558 474,83");
    expect(doc.text).not.toContain("Север");
    expect(doc.pages?.[0]?.width ?? 0).toBeGreaterThan(2000);
  });
});
