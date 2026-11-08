import { describe, expect, it } from "vitest";
import { localeFromPathname, stripLocalePrefix, withLocale } from "@/i18n/path";

describe("locale paths", () => {
  it("keeps Russian on the bare path and prefixes the other languages", () => {
    expect(withLocale("ru", "/audits")).toBe("/audits");
    expect(withLocale("en", "/audits")).toBe("/en/audits");
    expect(withLocale("zh", "/")).toBe("/zh");
    expect(stripLocalePrefix("/de/audits/demo")).toBe("/audits/demo");
    expect(stripLocalePrefix("/ru")).toBe("/");
    expect(localeFromPathname("/fr/new")).toBe("fr");
    expect(localeFromPathname("/audits")).toBe("ru");
  });
});
