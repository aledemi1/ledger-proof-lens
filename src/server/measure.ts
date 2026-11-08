import {
  normText,
  parseContractToken,
  parseDate,
  parseMoney,
  parseQuantity,
  productCodes,
  similarText,
  vatBasis,
  type VatBasis,
} from "./values";

export interface ShipmentRow {
  item: string;
  quantity: string;
  unit: string;
  gross: string;
}

const WORD_NUMBER: Record<string, number> = { один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6 };

/** A delivery line such as "1 Дозатор ДЭ-100 шт. 5 18 500,00 92 500,00 18 500,00 111 000,00". */
export function parseShipmentRow(text: string): ShipmentRow | null {
  const compact = text.replace(/\s+/g, " ").trim();
  const amounts = compact.match(/\d{1,3}(?:\s\d{3})*,\d{2}/g) ?? [];
  if (amounts.length < 2) return null;
  const gross = amounts[amounts.length - 1];
  if (!gross) return null;
  const without = compact.replace(/\d{1,3}(?:\s\d{3})*,\d{2}/g, " ").replace(/\s+/g, " ").trim();
  const match = without.match(/^(?:\d+\s+)?(.+?)\s+(шт\.?|компл\.?|час\.?|усл\.?)\s+(\d{1,4})$/i);
  if (!match?.[2] || !match[3]) return null;
  const item = (match[1] ?? "").trim();
  if (item.length < 3) return null;
  return { item, quantity: `${match[3]} ${match[2]}`, unit: match[2], gross };
}

/** "оплачивается по цене 14 250,00 руб. ... «Мешалка»" -> the new unit price stated by an amendment. */
/** "1 шт. 76 400,00 ..." when the item name is the previous line. */
export function parseQtyBeforeUnit(text: string, previous: string): ShipmentRow | null {
  const compact = text.replace(/\s+/g, " ").trim();
  const match = compact.match(/^(\d{1,4})\s+(шт\.?|компл\.?)/i);
  const amounts = compact.match(/\d{1,3}(?:\s\d{3})*,\d{2}/g) ?? [];
  const item = previous.replace(/\s+/g, " ").trim();
  const gross = amounts[amounts.length - 1];
  if (!match?.[1] || !match[2] || !gross || item.length < 3 || /\d{1,3}(?:\s\d{3})*,\d{2}/.test(item)) return null;
  return { item, quantity: `${match[1]} ${match[2]}`, unit: match[2], gross };
}

export function parseRestatedPrice(text: string): { item: string; price: string } | null {
  const item = text.match(/«([^»]{3,80})»/);
  const price = text.match(/цен\w*[^.\n]{0,40}?(\d[\d\s\u00A0]*[.,]\d{2})\s*руб/i);
  if (!item?.[1] || !price?.[1] || !/вместо|после\s+изменен|дополнительн/i.test(text)) return null;
  return { item: item[1], price: `${price[1]} руб.` };
}

export function parseRestatedDeadline(text: string): string | null {
  if (!/срок\s+поставк/i.test(text)) return null;
  return text.match(/(\d{2}\.\d{2}\.\d{4})/)?.[1] ?? null;
}

/** Pieces that make one kit, taken from a sentence in any document, keyed by product code. */
export function kitFactors(texts: string[]): Map<string, number> {
  const factors = new Map<string, number>();
  for (const text of texts) {
    const compact = text.replace(/\s+/g, " ");
    const numeric = compact.match(/(\d+)\s+[^\d.«]{0,40}?в\s+комплекте/i);
    const words = compact.match(/(один|одна|два|две|три|четыре|пять|шесть)\s+[^\d.«]{0,40}?составля\w+\s+один\s+(?:комплект|набор)/i);
    const pieces = numeric?.[1] ? Number(numeric[1]) : words?.[1] ? WORD_NUMBER[words[1].toLowerCase()] : undefined;
    if (!pieces || pieces < 2) continue;
    const codes = productCodes(compact);
    for (const code of codes) factors.set(code, pieces);
    if (!codes.length) factors.set("*", pieces);
  }
  return factors;
}

export function sameItem(left: string, right: string): boolean {
  if (similarText(left, right)) return true;
  const a = productCodes(left);
  const b = productCodes(right);
  return a.some((code) => b.includes(code));
}

export function moneyBasis(label: string, unit = ""): VatBasis {
  return vatBasis(`${label} ${unit}`);
}

export function toGross(minor: bigint, basis: VatBasis, ratePercent = 20): bigint | null {
  if (basis === "gross" || basis === "unknown") return minor;
  if (basis === "tax") return null;
  return (minor * BigInt(100 + ratePercent)) / 100n;
}

export function toNet(minor: bigint, basis: VatBasis, ratePercent = 20): bigint | null {
  if (basis === "net" || basis === "unknown") return minor;
  if (basis === "tax") return null;
  return (minor * 100n) / BigInt(100 + ratePercent);
}

export function convertMoney(minor: bigint, from: VatBasis, to: VatBasis): bigint | null {
  if (from === to || from === "unknown" || to === "unknown") return minor;
  if (to === "gross") return toGross(minor, from);
  if (to === "net") return toNet(minor, from);
  return null;
}

/** Report boundary: "состояние на 31.10.2025" or "за октябрь 2025". */
export function periodEnd(text: string): string | null {
  const explicit = text.match(/состояни[ея]\s+на\s+(\d{2}\.\d{2}\.\d{4})/i);
  const explicitDate = explicit?.[1] ? parseDate(explicit[1]) : null;
  if (explicitDate) return explicitDate;
  const month = text.match(/за\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)\w*\s+(\d{4})/i);
  if (!month?.[1] || !month[2]) return null;
  const names = ["январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];
  const index = names.findIndex((name) => month[1]?.toLowerCase().startsWith(name));
  if (index < 0) return null;
  const last = new Date(Date.UTC(Number(month[2]), index + 1, 0)).getUTCDate();
  return `${month[2]}-${String(index + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

export function documentDate(text: string): string | null {
  const dated = text.match(/(?:от|исполнен\w*|дата)\s+(\d{2}\.\d{2}\.\d{4})/i);
  return dated?.[1] ? parseDate(dated[1]) : null;
}

export function blankSignature(text: string): boolean {
  return /подпис|получил|принял/i.test(text) && /_{3,}/.test(text);
}

export function contractMentioned(text: string, token: string): boolean {
  const found = parseContractToken(text);
  if (!found) return false;
  return normText(found) === normText(token);
}
