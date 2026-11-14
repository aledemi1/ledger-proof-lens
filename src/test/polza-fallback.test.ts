import { afterEach, describe, expect, it, vi } from "vitest";
import { post } from "@/server/llm/chat";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["POLZA_API_KEY"];
  delete process.env["POLZA_AI_BASE_URL"];
  delete process.env["POLZA_AI_MODEL"];
});

describe("Polza fallback", () => {
  it("asks Polza when the primary model is unavailable", async () => {
    process.env["POLZA_API_KEY"] = "polza-test";
    process.env["POLZA_AI_BASE_URL"] = "https://polza.test/v1";
    process.env["POLZA_AI_MODEL"] = "openai/gpt-5.6-sol";
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        urls.push(String(url));
        const model = JSON.parse(String(init.body)).model as string;
        if (String(url).includes("polza.test")) {
          expect(model).toBe("openai/gpt-5.6-sol");
          return new Response("{}", { status: 200 });
        }
        expect(model).toBe("gpt-5.6-sol");
        return new Response("down", { status: 503 });
      }),
    );
    const response = await post(
      { baseUrl: "https://primary.test/v1", apiKey: "primary", model: "gpt-5.6-sol" },
      { model: "gpt-5.6-sol", messages: [] },
      1000,
    );
    expect(response.status).toBe(200);
    expect(urls.map((url) => new URL(url).host)).toEqual(["primary.test", "polza.test"]);
  });

  it("keeps a temperature rejection on the primary so the caller can retry it", async () => {
    process.env["POLZA_API_KEY"] = "polza-test";
    process.env["POLZA_AI_BASE_URL"] = "https://polza.test/v1";
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return new Response("temperature is unsupported", { status: 400 });
      }),
    );
    const response = await post(
      { baseUrl: "https://primary.test/v1", apiKey: "primary", model: "gpt-5.6-sol" },
      { model: "gpt-5.6-sol", temperature: 0 },
      1000,
    );
    expect(response.status).toBe(400);
    expect(calls).toBe(1);
  });
});