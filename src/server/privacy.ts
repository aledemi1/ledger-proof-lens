import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export interface MaskMapping {
  version: number;
  labels: Record<string, { type: string; original: string; key: string; n: number }>;
}

export interface MaskedBatch {
  texts: string[];
  mapping: MaskMapping;
}

function privacyOff(): boolean {
  return process.env["SVERKO_PRIVACY"] === "off";
}

function firstExisting(candidates: string[]): string | undefined {
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

function pythonBin(): string {
  const configured = process.env["SVERKO_PRIVACY_PYTHON"]?.trim() ?? "";
  const folder = process.platform === "win32" ? "Scripts" : "bin";
  const name = process.platform === "win32" ? "python.exe" : "python";
  const local = path.resolve("third_party", ".venv", folder, name);
  return firstExisting([configured, "/opt/venv/bin/python", local]) ?? (configured || local);
}

function bridgePath(): string {
  const configured = process.env["SVERKO_PRIVACY_BRIDGE"]?.trim() ?? "";
  const resolved = configured ? path.resolve(configured) : "";
  return firstExisting([resolved, "/app/scripts/privacy/mask_bridge.py", path.resolve("scripts", "privacy", "mask_bridge.py")]) ?? (resolved || path.resolve("scripts", "privacy", "mask_bridge.py"));
}

/** Runs the local pii-mask / Presidio bridge. Refuses to continue if it cannot mask. */
function runBridge(payload: unknown): Promise<unknown> {
  const python = pythonBin();
  const bridge = bridgePath();
  const pythonMissing = python.includes(path.sep) && !existsSync(python);
  if (!existsSync(bridge) || pythonMissing) {
    return Promise.reject(new Error("локальная маскировка не установлена (python scripts/privacy/setup.py)"));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(python, [bridge], { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("локальная маскировка не ответила"));
    }, 120_000);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const detail = Buffer.concat(err).toString("utf8").trim();
        reject(new Error(detail || `маскировка завершилась с кодом ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(out).toString("utf8")) as unknown);
      } catch {
        reject(new Error("маскировка вернула не JSON"));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

/** Replaces confidential spans before a payload is sent to an external model. */
export async function maskTexts(texts: string[]): Promise<MaskedBatch> {
  if (privacyOff()) return { texts, mapping: { version: 1, labels: {} } };
  const response = (await runBridge({
    action: "mask",
    items: texts.map((text, index) => ({ id: String(index), text })),
  })) as { items?: { text?: string }[]; mapping?: MaskMapping };
  const masked = response.items?.map((item) => item.text ?? "") ?? [];
  if (masked.length !== texts.length || !response.mapping) throw new Error("маскировка вернула неполный ответ");
  return { texts: masked, mapping: response.mapping };
}

/** Restores labels in a model reply. Unknown labels stay marked and are not filled with someone else's data. */
export async function unmaskText(text: string, mapping: MaskMapping): Promise<string> {
  if (privacyOff() || !Object.keys(mapping.labels).length) return text;
  const response = (await runBridge({ action: "unmask", text, mapping })) as { text?: string };
  if (typeof response.text !== "string") throw new Error("обратная подстановка не вернула текст");
  return response.text;
}
