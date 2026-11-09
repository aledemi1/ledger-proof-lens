import fs from "node:fs";
import path from "node:path";

let loaded = false;

/** Loads `.env` into process.env without overriding variables that are already set. */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] == null) process.env[key] = value;
  }
}

export function aiConfig(): { baseUrl: string; apiKey: string; model: string } | null {
  loadEnv();
  const lovable = process.env["LOVABLE_API_KEY"]?.trim();
  if (lovable) {
    return {
      baseUrl: (process.env["LOVABLE_AI_BASE_URL"] || "https://ai.gateway.lovable.dev/v1").replace(/\/$/, ""),
      apiKey: lovable,
      model: process.env["LOVABLE_AI_MODEL"] || "google/gemini-2.5-flash",
    };
  }
  const apiKey = process.env["AI_API_KEY"]?.trim();
  if (!apiKey) return null;
  return {
    baseUrl: (process.env["AI_BASE_URL"] || "https://api.openai.com/v1").replace(/\/$/, ""),
    apiKey,
    model: process.env["AI_MODEL"] || "gpt-5.6-sol",
  };
}
