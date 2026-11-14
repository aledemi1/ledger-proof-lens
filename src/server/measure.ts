import {
  normText,
  parseDecimal,
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

const SHIPMENT_UNIT = "шт\\.?|компл\\.?|час\\.?|усл\\.?|pcs\\.?|pieces?|hours?|service|stk\\.?|szt\\.?|pz\\.?|ud\\.?|adet";
const SHIPMENT_AMOUNT = "\\d{1,3}(?:[ \\u00A0]\\d{3})+(?:[.,]\\d{2})?|\\d{1,3}(?:,\\d{3})+(?:\\.\\d{2})?|\\d+[.,]\\d{2}";

/** A delivery line: name then unit then quantity, or name then quantity then unit, followed by at least a price and an amount. */
const PIECE_UNIT = "шт\\.?|pcs\\.?|pieces?|stk\\.?|szt\\.?|pz\\.?|ud\\.?|adet";

export function parseShipmentRow(text: string): ShipmentRow | null {
  const compact = text.replace(/\s+/g, " ").trim();
  if ((compact.match(/qty|quantity|price|description|\bunit\b|кол-?во|цена|наименован|единиц/gi) ?? []).length >= 2) return null;
  const unitThenQty = compact.match(new RegExp(`^(?:\\d+\\s+)?(.+?)\\s+(${SHIPMENT_UNIT})\\s+(\\d{1,4})\\s+(.+)$`, "i"));
  const qtyThenUnit = compact.match(new RegExp(`^(?:\\d+\\s+)?(.+?)\\s+(?<![-\\d\\p{L}])(\\d{1,4})\\s+(${PIECE_UNIT})\\s+(.+)$`, "iu"));
  const parsed = [
    qtyThenUnit?.[1] && qtyThenUnit[2] && qtyThenUnit[3] && qtyThenUnit[4]
      ? shipmentFrom(qtyThenUnit[1], qtyThenUnit[3], qtyThenUnit[2], qtyThenUnit[4])
      : null,
    unitThenQty?.[1] && unitThenQty[2] && unitThenQty[3] && unitThenQty[4]
      ? shipmentFrom(unitThenQty[1], unitThenQty[2], unitThenQty[3], unitThenQty[4])
      : null,
  ];
  return parsed.find((row) => row != null) ?? null;
}

function shipmentFrom(itemRaw: string, unit: string, qty: string, tail: string): ShipmentRow | null {
  if (/^\d{3}(?!\d)/.test(tail)) return null;
  const amounts = tail.match(new RegExp(SHIPMENT_AMOUNT, "g")) ?? [];
  const gross = amounts[amounts.length - 1];
  const item = itemRaw.trim();
  if (!gross || amounts.length < 2 || item.length < 3 || /^(итого|всего)\b/i.test(item)) return null;
  return { item, quantity: `${qty} ${unit}`, unit, gross };
}

/** A party name ends where the next party's role begins. */
export function clipParty(value: string): string {
  const cut = value.search(/(?:^|[\s.»"”])(?:получател\w*|заказчик\w*|покупател\w*|плательщик\w*|грузополучател\w*|грузоотправител\w*|исполнител\w*|поставщик\w*|представител\w*|customer|buyer|supplier|vendor|recipient|consignee|payer)\b/i);
  const sliced = cut > 0 ? value.slice(0, cut) : value;
  return sliced.replace(/[\s.;,]+$/g, "").trim();
}

/** "Цена договора ... составляет 1 842 960,00 руб." The contract price is the largest amount in that sentence. */
export function parseContractPrice(text: string): string | null {
  const compact = text.replace(/\s+/g, " ");
  const start = compact.search(/цена\s+договора|contract\s+price|vertragspreis|prix.{0,40}?contrat|prezzo.{0,40}?contratto|precio.{0,40}?contrato|pre[cç]o.{0,40}?contrato|cena.{0,24}?umow|contractprijs|prijs.{0,40}?contract|sözleşme\s+bedeli|sozlesme\s+bedeli|合同价/i);
  if (start < 0) return null;
  const window = compact.slice(start, start + 260);
  const cut = window.search(/оборудован|ausr[uü]stung|equipment|[eé]quipement|attrezzatur|equipo|ekipman|sprz[eę]t|设备/i);
  const sentence = cut > 30 ? window.slice(0, cut) : window.slice(0, 180);
  const amounts = [...sentence.matchAll(/(\d[\d\s\u00A0]*[.,]\d{2})\s*(?:руб|rub)/gi)].map((item) => item[1] ?? "");
  const chosen = amounts.sort((a, b) => Number(b.replace(/[^\d]/g, "")) - Number(a.replace(/[^\d]/g, "")))[0];
  return chosen ? `${chosen} руб.` : null;
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
  const match = compact.match(/^(\d{1,4})\s+(шт\.?|компл\.?|pcs\.?|pieces?|szt\.?|pz\.?|ud\.?|adet)/i);
  const amounts = compact.match(/\d{1,3}(?:[ \u00A0]\d{3})*,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}/g) ?? [];
  const item = previous.replace(/\s+/g, " ").trim();
  const gross = amounts[amounts.length - 1];
  if (!match?.[1] || !match[2] || !gross || item.length < 3 || /\d{1,3}(?:[ \u00A0]\d{3})*,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}/.test(item)) return null;
  return { item, quantity: `${match[1]} ${match[2]}`, unit: match[2], gross };
}

export function parseRestatedPrice(text: string): { item: string; price: string } | null {
  const item = text.match(/[«“„"]([^»”"“]{3,80})[»”"“]/);
  const price = text.match(/(?:цен\w*|\bprice\b|preis|prix|precio|prezzo|preço|preco|cena|prijs|fiyat|单价)[^.\n]{0,40}?(\d[\d\s\u00A0]*[.,]\d{2})\s*(?:руб|rub)/i);
  if (!item?.[1] || !price?.[1] || !/вместо|после\s+изменен|дополнительн|instead|after\s+the\s+amend|anstelle|statt\b|au lieu|invece|en lugar|em vez|zamiast|in plaats|yerine|改为/i.test(text)) return null;
  return { item: item[1], price: `${price[1]} руб.` };
}

export function parseRestatedDeadline(text: string): string | null {
  if (!/срок[\s\S]{0,40}?поставк|delivery[\s\S]{0,40}?(?:period|deadline)|lieferfrist|d[eé]lai[\s\S]{0,40}?livraison|termine[\s\S]{0,40}?consegna|plazo[\s\S]{0,40}?entrega|termin[\s\S]{0,40}?dostaw|levertermijn|teslim[\s\S]{0,40}?s[uü]resi|交货期/i.test(text)) return null;
  const numeric = text.match(/(\d{2}\.\d{2}\.\d{4})/)?.[1];
  if (numeric) return numeric;
  const named = text.match(/(\d{1,2}\s+\p{L}+\s+\d{4})/u)?.[1];
  return named && parseDate(named) ? named : null;
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

/** "1 Масса порошка 2 500 г 2 Цена ... 4 000 ₽/кг" from a flattened indicator table. */
export function parseIndicatorRows(text: string, allowSingle = false): { label: string; value: string; unit: string }[] {
  const compact = text.replace(/\s+/g, " ").trim();
  const header = compact.match(/^.*?(?:№\s*)?показател\w*\s+значен\w*(?:\s+\S+)?\s+/i);
  const source = header ? compact.slice(header[0].length) : compact;
  const chunks = source.split(/(?<=^|\s)(?=\d{1,2}\s+(?!шт|час|ч(?:\s|$)|мес|₽|руб|кг|км|г(?:\s|$)|мин|чел|м(?:\s|$))\p{L})/u).map((part) => part.trim()).filter(Boolean);
  const rows = chunks.map(parseIndicatorChunk).filter((row): row is { label: string; value: string; unit: string } => row != null);
  if (rows.length < 2 && !header && !allowSingle) return [];
  return rows;
}

/** One numbered indicator row, used after a table header on a previous line. */
export function parseIndicatorLine(text: string): { label: string; value: string; unit: string } | null {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!/^\d{1,2}\s+\p{L}/u.test(compact)) return null;
  return parseIndicatorRows(compact, true)[0] ?? null;
}

function parseIndicatorChunk(chunk: string): { label: string; value: string; unit: string } | null {
  const body = chunk.replace(/^\d{1,2}\s+/, "").trim();
  if (!body) return null;
  const numeric = body.match(/^(.+?)\s+(\d[\d\s\u00A0]*(?:[.,]\d+)?)\s+([^\d\s][^\s]{0,16})$/u);
  if (numeric?.[1] && numeric[2] && numeric[3] && numeric[1].trim().length >= 2) {
    return { label: numeric[1].trim(), value: numeric[2].trim(), unit: numeric[3].trim() };
  }
  const party = body.match(/^(.+?)\s+((?:ООО|АО|ПАО|ЗАО|ИП)\s+.+)$/u);
  if (party?.[1] && party[2] && party[1].trim().length >= 2) return { label: party[1].trim(), value: party[2].trim(), unit: "" };
  const token = body.match(/^(.+?)\s+((?:[A-ZА-ЯЁ]{1,8}[-\s]?)?\d{0,4}[A-ZА-ЯЁ]{0,4}-\d{1,4}\/\d{2,4}|\d{2}\.\d{2}\.\d{4})$/u);
  if (token?.[1] && token[2] && token[1].trim().length >= 2) return { label: token[1].trim(), value: token[2].trim(), unit: "" };
  return null;
}

/** A goods line whose unit sits in the header: "Весы ЛВ-200 4 25 000 100 000". */
export function parseBareShipment(text: string, header: string): ShipmentRow | null {
  if (!/кол|qty|quantity|menge|количество/i.test(header) || !/цен|сумм|price|amount|стоим/i.test(header)) return null;
  const compact = text.replace(/\s+/g, " ").trim();
  const unit = header.match(/шт\.?|кг|pcs\.?|pieces?/i)?.[0] ?? "шт.";
  const withUnit = compact.match(new RegExp(`(?:\\d+\\s+)?(.+?)\\s+${unit.replace(/\./g, "\\.")}\\s+(\\d{1,4})\\s+(.+)$`, "i"));
  if (withUnit?.[1] && withUnit[2] && withUnit[3]) {
    const amounts = withUnit[3].match(/\d{1,3}(?:[ \u00A0]\d{3})+(?:[.,]\d{2})?|\d+[.,]\d{2}/g) ?? [];
    const gross = amounts[amounts.length - 1];
    const item = withUnit[1].trim();
    if (gross && amounts.length >= 2 && item.length >= 3 && !/^(итого|всего)\b/i.test(item)) {
      return { item, quantity: `${withUnit[2]} ${unit}`, unit, gross };
    }
  }
  const match = compact.match(/^(?:\d+\s+)?(.+?)\s+(\d{1,4})\s+(\d{1,3}(?:[ \u00A0]\d{3})+(?:[.,]\d{2})?|\d+[.,]\d{2})\s+(\d{1,3}(?:[ \u00A0]\d{3})+(?:[.,]\d{2})?|\d+[.,]\d{2})$/);
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) return null;
  const item = match[1].trim();
  if (item.length < 3 || /^(итого|всего)\b/i.test(item)) return null;
  return { item, quantity: `${match[2]} ${unit}`, unit, gross: match[4] };
}

export function statedTolerance(text: string): bigint | null {
  const match = text.match(/абсолютн\p{L}*\s+допуск\p{L}*\s+(\d+[.,]\d+)\s*(?:₽|руб)/iu);
  if (!match?.[1]) return null;
  return parseDecimal(match[1]);
}

/** Report boundary: "состояние на 31.10.2025", "01.10.2025–31.10.2025" or "за октябрь 2025". */
export function periodEnd(text: string): string | null {
  const explicit = text.match(/состояни[ея]\s+на\s+(\d{2}\.\d{2}\.\d{4})/i);
  const explicitDate = explicit?.[1] ? parseDate(explicit[1]) : null;
  if (explicitDate) return explicitDate;
  const range = text.match(/(\d{2}\.\d{2}\.\d{4})\s*[–—-]\s*(\d{2}\.\d{2}\.\d{4})/);
  const rangeEnd = range?.[2] ? parseDate(range[2]) : null;
  if (rangeEnd) return rangeEnd;
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
  if (/подпис|получил|принял/i.test(text) && /_{3,}/.test(text)) return true;
  return text.split(/\n/).some((line) => {
    const trimmed = line.trim();
    if (!/подпис/i.test(trimmed) || trimmed.length > 80) return false;
    const after = trimmed.replace(/^.*подпис\w*[:\s]*/i, "").replace(/[_\s.—–-]/g, "");
    return after.length < 3;
  });
}

export function contractMentioned(text: string, token: string): boolean {
  const found = parseContractToken(text);
  if (!found) return false;
  return normText(found) === normText(token);
}
