import { maskTexts, unmaskText } from "../privacy";

export type AiConfig = { baseUrl: string; apiKey: string; model: string };

export async function chatJson(config: AiConfig, system: string, data: unknown, timeoutMs = 45_000): Promise<unknown> {
  const masked = await maskTexts([JSON.stringify(data)]);
  const messages = [
    { role: "system", content: system },
    { role: "user", content: masked.texts[0] ?? "{}" },
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

export async function post(config: AiConfig, body: unknown, timeoutMs = 45_000): Promise<Response> {
  return fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

