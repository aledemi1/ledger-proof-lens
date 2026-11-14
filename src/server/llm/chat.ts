import { polzaConfig } from "../env";
import { paintPage, pageIsCovered, type WordBox } from "../extract/redact";
import { maskTexts, unmaskText, type MaskMapping } from "../privacy";

export type AiConfig = { baseUrl: string; apiKey: string; model: string };

export interface OutboundPage {
  name: string;
  pageNumber: number;
  image: Buffer;
  width: number;
  height: number;
  words: WordBox[];
}

type ChatPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

async function jpegPage(png: Buffer): Promise<Buffer> {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext("2d").drawImage(image, 0, 0);
  return canvas.toBuffer("image/jpeg", 70);
}

function maskKnown(value: string, mapping: MaskMapping): string {
  let text = value;
  const entries = Object.entries(mapping.labels).sort((left, right) => right[1].original.length - left[1].original.length);
  for (const [token, meta] of entries) {
    if (meta.original) text = text.split(meta.original).join(token);
  }
  return text;
}

export async function chatJson(config: AiConfig, system: string, data: unknown, timeoutMs = 45_000, pages: OutboundPage[] = []): Promise<unknown> {
  const masked = await maskTexts([JSON.stringify(data)]);
  const mapping = masked.mapping;
  const text = masked.texts[0] ?? "{}";
  const parts: ChatPart[] = [{ type: "text", text }];
  const outgoing = process.env["SVERKO_PAGE_IMAGES"] === "off" ? [] : pages;
  for (const page of outgoing) {
    if (!pageIsCovered(page.words, mapping)) continue;
    const painted = await paintPage(page.image, page.width, page.height, page.words, mapping);
    const jpeg = await jpegPage(painted);
    parts.push({ type: "text", text: `Изображение: ${maskKnown(page.name, mapping)}, страница ${page.pageNumber}.` });
    parts.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } });
  }
  const messages = [
    { role: "system", content: system },
    { role: "user", content: parts.length > 1 ? parts : text },
  ];
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response = await post(config, { model: config.model, temperature: 0, response_format: { type: "json_object" }, messages }, timeoutMs);
    if (response.status === 400 && /temperature/i.test(await response.clone().text())) {
      response = await post(config, { model: config.model, response_format: { type: "json_object" }, messages }, timeoutMs);
    }
    if (!response.ok) throw new Error(`модель ответила ${response.status}`);
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = (payload.choices?.[0]?.message?.content ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "");
    const content = await unmaskText(raw, masked.mapping);
    try {
      return JSON.parse(content) as unknown;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("модель вернула не JSON");
}

function withModel(body: unknown, model: string): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  return { ...body, model };
}

async function postOnce(config: AiConfig, body: unknown, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await Promise.race([
      fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      new Promise<Response>((_resolve, reject) => {
        setTimeout(() => reject(new Error("модель не ответила вовремя")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function post(config: AiConfig, body: unknown, timeoutMs = 45_000): Promise<Response> {
  const fallback = polzaConfig();
  const same = fallback != null && fallback.baseUrl === config.baseUrl && fallback.apiKey === config.apiKey;
  const spare = fallback && !same ? fallback : null;
  try {
    const response = await postOnce(config, body, timeoutMs);
    if (response.ok || !spare) return response;
    if (response.status === 400 && /temperature/i.test(await response.clone().text())) return response;
    return postOnce(spare, withModel(body, spare.model), timeoutMs);
  } catch (error) {
    if (!spare) throw error;
    return postOnce(spare, withModel(body, spare.model), timeoutMs);
  }
}

