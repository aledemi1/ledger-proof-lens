// @vitest-environment node
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { maskTexts, unmaskText } from "@/server/privacy";

const python = path.resolve("third_party", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const ready = existsSync(python);

describe("privacy stub", () => {
  it("masks an email and restores it", async () => {
    const masked = await maskTexts(["Письмо на ivan@example.com и снова ivan@example.com."]);
    const text = masked.texts[0] ?? "";
    expect(text.toLowerCase()).not.toContain("ivan@example.com");
    expect(text).toContain("{{EMAIL_1}}");
    expect(await unmaskText(text, masked.mapping)).toContain("ivan@example.com");
  });
});

describe.skipIf(!ready)("local privacy bridge", () => {
  it("gives one label to the same Russian person and masks an English name", async () => {
    process.env["SVERKO_PRIVACY_PYTHON"] = python;
    process.env["SVERKO_PRIVACY_BRIDGE"] = path.resolve("scripts/privacy/mask_bridge.py");
    const masked = await maskTexts([
      "Поставщик ООО «Вектор Аналитика», ИНН 6083778353, Иван Петров.",
      "Подписал Иван Петров.",
      "Supplier Ivan Petrov, email ivan@example.com.",
    ]);
    const first = masked.texts[0] ?? "";
    const second = masked.texts[1] ?? "";
    const third = masked.texts[2] ?? "";
    expect(first).not.toContain("Иван Петров");
    expect(first).not.toContain("6083778353");
    expect(second).toContain("{{PERSON_");
    const person = second.match(/\{\{PERSON_\d+\}\}/)?.[0];
    expect(person).toBeTruthy();
    expect(first).toContain(person ?? "");
    expect(third.toLowerCase()).not.toContain("ivan@example.com");
    const restored = await unmaskText(first, masked.mapping);
    expect(restored).toContain("6083778353");
  }, 120_000);
});
