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

const WORD_NUMBER: Record<string, number> = {
  один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  trois: 3, drei: 3, tres: 3, tre: 3, trzy: 3, drie: 3, üç: 3, uc: 3,
};

/** A delivery line such as "1 Дозатор ДЭ-100 шт. 5 18 500,00 92 500,00 18 500,00 111 000,00". */
export function parseShipmentRow(text: string): ShipmentRow | null {
  const compact = text.replace(/\s+/g, " ").trim();
  const match = compact.match(/^(?:\d+\s+)?(.+?)\s+(шт\.?|компл\.?|час\.?|усл\.?|pcs\.?|pieces?|hours?|service|stk\.?)\s+(\d{1,4})\s+(.+)$/i);
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) return null;
  const amounts = match[4].match(/\d{1,3}(?:[ \u00A0]\d{3})*,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}/g) ?? [];
  const gross = amounts[amounts.length - 1];
  const item = match[1].trim();
  if (!gross || amounts.length < 2 || item.length < 3 || /^(итого|всего)\b/i.test(item)) return null;
  return { item, quantity: `${match[3]} ${match[2]}`, unit: match[2], gross };
}

/** "Цена договора ... составляет 1 842 960,00 руб." */
export function parseContractPrice(text: string): string | null {
  const compact = text.replace(/\s+/g, " ");
  const match = compact.match(/(?:цена\s+договора|contract\s+price|vertragspreis|prix[\s\S]{0,40}?contrat|prezzo[\s\S]{0,40}?contratto|precio[\s\S]{0,40}?contrato|pre[cç]o[\s\S]{0,40}?contrato|cena[\s\S]{0,24}?umow|contractprijs|sözleşme\s+bedeli|sozlesme\s+bedeli|合同价)[\s\S]{0,140}?(?:составляет|\bis\b|\bist\b|\best\b|beträgt|betragt|s[\u2019'][eéè]l[eéè]ve|ammonta|asciende|importa|wynosi|bedraagt|tutar|为)(?:\s+\S+){0,2}\s+(\d[\d\s\u00A0]*[.,]\d{2})\s*(?:руб|rub)/i);
  return match?.[1] ? `${match[1]} руб.` : null;
}

/** The amount a service document itself states as payable, not a line inside its calculation. */
export function parseStatedTotal(text: string): string | null {
  const compact = text.replace(/\s+/g, " ");
  const payable = compact.match(/(?:всего\s+к\s+оплате|total\s+payable|amount\s+due|zu\s+zahlen|à\s+payer|a\s+pagare|a\s+pagar|totale\s+da\s+pagare|do\s+zapłaty|te\s+betalen|ödenecek|应付)[^.]{0,50}?(\d[\d\s\u00A0]*[.,]\d{2})\s*(?:руб|rub)/i);
  if (payable?.[1]) return `${payable[1]} руб.`;
  const overall = compact.match(/(?:общая\s+стоимость|total\s+cost|gesamtbetrag|coût\s+total|costo\s+totale|coste\s+total|custo\s+total|łączny\s+koszt|totale\s+kosten|toplam\s+bedel|总费用)[^.]{0,80}?(\d[\d\s\u00A0]*[.,]\d{2})\s*(?:руб|rub)/i);
  if (overall?.[1]) return `${overall[1]} руб.`;
  const total = compact.match(/всего\s+(\d[\d\s\u00A0]*[.,]\d{2})\s*руб/i);
  if (!total?.[1] || total.index == null) return null;
  const around = compact.slice(Math.max(0, total.index - 24), total.index + total[0].length);
  if (/без\s+ндс/i.test(around)) return null;
  return `${total[1]} руб.`;
}

/** "оплачивается по цене 14 250,00 руб. ... «Мешалка»" -> the new unit price stated by an amendment. */
/** "1 шт. 76 400,00 ..." when the item name is the previous line. */
export function parseQtyBeforeUnit(text: string, previous: string): ShipmentRow | null {
  const compact = text.replace(/\s+/g, " ").trim();
  const match = compact.match(/^(\d{1,4})\s+(шт\.?|компл\.?|pcs\.?|pieces?)/i);
  const amounts = compact.match(/\d{1,3}(?:[ \u00A0]\d{3})*,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}/g) ?? [];
  const item = previous.replace(/\s+/g, " ").trim();
  const gross = amounts[amounts.length - 1];
  if (!match?.[1] || !match[2] || !gross || item.length < 3 || /\d{1,3}(?:[ \u00A0]\d{3})*,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}/.test(item)) return null;
  return { item, quantity: `${match[1]} ${match[2]}`, unit: match[2], gross };
}

export function parseRestatedPrice(text: string): { item: string; price: string } | null {
  const item = text.match(/[«“"]([^»”"]{3,80})[»”"]/);
  const price = text.match(/(?:цен\w*|\bprice\b|preis|prix|precio|prezzo|preço|preco|cena|prijs|fiyat|单价)[^.\n]{0,40}?(\d[\d\s\u00A0]*[.,]\d{2})\s*(?:руб|rub)/i);
  if (!item?.[1] || !price?.[1] || !/вместо|после\s+изменен|дополнительн|instead|after\s+the\s+amend|anstelle|au lieu|invece|en lugar|em vez|zamiast|in plaats|yerine|改为/i.test(text)) return null;
  return { item: item[1], price: `${price[1]} руб.` };
}

export function parseRestatedDeadline(text: string): string | null {
  if (!/срок\s+поставк|delivery\s+(?:period|deadline)|lieferfrist|délai\s+de\s+livraison|delai\s+de\s+livraison|termine\s+di\s+consegna|plazo\s+de\s+entrega|termin\s+dostawy|levertermijn|teslim\s+süresi|teslim\s+suresi|交货期/i.test(text)) return null;
  return text.match(/(\d{2}\.\d{2}\.\d{4})/)?.[1] ?? null;
}

/** Pieces that make one kit, taken from a sentence in any document, keyed by product code. */
export function kitFactors(texts: string[]): Map<string, number> {
  const factors = new Map<string, number>();
  for (const text of texts) {
    const compact = text.replace(/\s+/g, " ");
    const numeric = compact.match(/(\d+)\s+[^\d.«]{0,40}?(?:в\s+комплекте|in\s+(?:the\s+)?(?:kit|set)|im\s+set|dans\s+le\s+(?:kit|jeu)|nel\s+(?:kit|set)|en\s+el\s+(?:kit|juego)|no\s+kit|w\s+zestawie|in\s+de\s+set|sette)/i);
    const words = compact.match(/(один|одна|два|две|три|четыре|пять|шесть)\s+[^\d.«]{0,40}?составля\w+\s+один\s+(?:комплект|набор)/i);
    const included = compact.match(/(?:includes|comprend|comprende|enthält|enthalt|incluye|inclui|zawiera|bevat|içerir|icerir|包含)\s+(\d+|one|two|three|trois|drei|tres|tre|trzy|drie|üç|uc)\b/i);
    const token = numeric?.[1] ?? words?.[1] ?? included?.[1];
    const pieces = token && /^\d+$/.test(token) ? Number(token) : token ? WORD_NUMBER[token.toLowerCase()] : undefined;
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
