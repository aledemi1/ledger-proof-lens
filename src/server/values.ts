/** Exact decimal and identifier parsing. Missing text is never coerced to zero. */

export type Role =
  | "contract_number"
  | "inn"
  | "counterparty"
  | "item_name"
  | "quantity"
  | "unit_price"
  | "line_total"
  | "transport"
  | "date"
  | "text";

const SCALE = 10000n;

const ROLE_RULES: { role: Role; re: RegExp }[] = [
  { role: "inn", re: /(^|[^\p{L}\p{N}])(инн|inn|nif|nip|ust-?id|税号)(?=[^\p{L}\p{N}]|$)/iu },
  { role: "contract_number", re: /договор|contract|vertrag|contrat|contratto|contrato|umowa|overeenkomst|sözleşme|sozlesme|合同/i },
  { role: "counterparty", re: /поставщик|контрагент|исполнитель|покупатель|заказчик|грузоотправитель|грузополучатель|supplier|vendor|customer|buyer|lieferant|kunde|fournisseur|acheteur|fornitore|cliente|proveedor|comprador|fornecedor|dostawca|odbiorca|leverancier|koper|tedarikçi|alıcı|供应商|买方/i },
  { role: "transport", re: /транспорт|доставк|перевоз|transport|delivery|shipping|fracht|lieferung|livraison|trasporto|transporte|przewóz|przewoz|vervoer|nakliye|运输/i },
  { role: "unit_price", re: /цена|тариф|стоимость\s+единиц|за\s+единиц|unit\s*price|\bprice\b|\brate\b|\bprijs\b|\btarif|\btariff|\btarief\b|preis|prix|precio|prezzo|preço|preco|cena jedn|\bcena\b|stukprijs|taryfa|birim fiyat|\bfiyat\b|\bpre[cç]o\b|费率|单价/i },
  { role: "quantity", re: /кол-?во|количество|поставлено|число\s+единиц|объ[её]м|quantity|qty|volume|volumen|umfang|omvang|hacim|accepted|received|geaccepteerd|angenommen|akzeptiert|abzüglich|abzuglich|accept[eé]|d[eé]duction|aceptado|aceito|aceite|accettato|przyj[eę]t|ontvangen|kabul|\breceipt\b|\bbalance\b|\bhours\b|\bkm\b|menge|cantidad|quantité|quantite|quantità|quantita|quantidade|ilość|ilosc|hoeveelheid|miktar|数量|体积|验收|已收|приход|остаток/i },
  { role: "line_total", re: /стоимость|сумма|итого|всего|(^|[^\p{L}])с\s*ндс|(^|[^\p{L}])без\s*ндс|amount|total|summe|suma|totale|montant|importo|importe|betrag|bedrag|tutar|金额|合计|不含|含|without|excluding|excl\.?|including|incl\.?|ohne|zonder|netto|brutto|\bbez\b|\bkwota\b|z\s*(?:ндс|vat\b)|hors\s|avec\s|\bcom\s|con\s|sin\s|hari[cç]|dahil|\bmet\s|mit\s*(?:ндс|mwst|vat)|senza|sem\s|(^|[^\p{L}])value(?=[^\p{L}]|$)/iu },
  { role: "date", re: /(^|[^\p{L}])(дата|date|datum|fecha|data|tarih\w*|日期)(?=[^\p{L}]|$)/iu },
  { role: "item_name", re: /наименование|номенклатур|товар|оборудован|услуг|description|bezeichnung|désignation|designation|denominazione|denomina|descrizione|descrição|descricao|nazwa|benaming|omschrijving|açıklama|aciklama|名称|品名|(?<![\p{L}])item(?!\s*code)/iu },
];

export const headerWord = {
  indicator: /показател|indicator|kennzahl|indicateur|indicatore|indicador|wskaźnik|wskaznik|kengetal|gösterge|gosterge|指标/i,
  value: /значен|value|wert|valeur|valore|valor|wartość|wartosc|waarde|değer|deger|数值/i,
  unit: /^(ед\.?|единица|unit|einheit|unidad|ud\.?|unid\.?|unité|unite|unità|unita|unidade|jednostka|jedn\.?|eenheid|eenh\.?|birim|单位)(?:\s|$)/i,
  item: /наименован|номенклатур|вид\s+работ|type\s+of\s+work|art\s+der\s+arbeit|type\s+de\s+(?:travaux|prestation)|tipo\s+di\s+lavor[oi]|tipo\s+de\s+trabajos|tipo\s+de\s+trabajo|tipo\s+de\s+trabalho|rodzaj\s+prac|soort\s+werk|benaming|[İIıi]ş\s+türü|is\s+turu|工种|description|bezeichnung|désignation|designation|denominazione|denomina[cç][aã]o|denominaci[oó]n|descrizione|descrição|descricao|nazwa|omschrijving|açıklama|aciklama|(?:^|[^\p{L}])ad[ıi](?:[^\p{L}]|$)|名称|品名|(?<![\p{L}])item(?!\s*code)/iu,
  code: /(?<![\p{L}])(код\w*|артикул|article|art[ií]culo|artyku[lł]|sku|artikel\w*|artikelnummer|code|référence|reference|código|codigo|codice|kod\w*|货号|编码)/iu,
  qty: /кол-?во|количество|объем|объём|принято|получено|angenommen|akzeptiert|abzüglich|abzuglich|accept[eé]|d[eé]duction|umfang|hacim|kabul|^часы?$|quantity|qty|volume|accepted|received|receipt|balance|menge|cantidad|quantité|quantite|quantidade|ilość|ilosc|hoeveelheid|miktar|数量|体积|验收|已收|^hours?$|^km$|^км$/i,
  total: /^(итого|всего|total|summe|suma|totale|toplam|totaal|gesamt|合计|总计)/i,
};

export function detectRole(label: string): Role | null {
  const s = label.trim();
  if (!s) return null;
  for (const rule of ROLE_RULES) if (rule.re.test(s)) return rule.role;
  return null;
}

export function normText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function similarText(a: string, b: string): boolean {
  const x = normText(a);
  const y = normText(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const ta = new Set(x.split(" ").filter((w) => w.length > 2));
  const tb = new Set(y.split(" ").filter((w) => w.length > 2));
  if (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))) {
    const shorter = x.length <= y.length ? x : y;
    const longer = x.length <= y.length ? y : x;
    const extra = longer.replace(shorter, " ").split(" ").filter((word) => word.length > 2);
    if (extra.length <= 1) return true;
  }
  if (!ta.size || !tb.size) return false;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter += 1;
  const recall = inter / Math.min(ta.size, tb.size);
  const coverage = inter / Math.max(ta.size, tb.size);
  return recall >= 0.6 && coverage >= 0.5;
}

/** Accepts both 1 842 960,00 and 1,842,960.00 without rounding. */
export function parseDecimal(raw: string): bigint | null {
  let s = raw.replace(/[\s\u00A0]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    const thousands = parts.length > 2 || (parts.length === 2 && (parts[1]?.length ?? 0) === 3 && (parts[0]?.replace("-", "").length ?? 0) >= 1 && !parts[0]?.includes("."));
    const grouped = parts.slice(1).every((part) => part.length === 3);
    s = thousands && grouped ? parts.join("") : s.replace(",", ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const [whole, frac = ""] = s.split(".");
  if (whole == null) return null;
  const padded = (frac + "0000").slice(0, 4);
  const value = BigInt(whole) * SCALE + BigInt(padded);
  return neg ? -value : value;
}

function numberToken(raw: string): { num: string; rest: string } | null {
  const m = raw
    .trim()
    .match(/(-?\d{1,3}(?:[ \u00A0,]\d{3})+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?)(.*)$/s);
  if (!m?.[1]) return null;
  return { num: m[1], rest: (m[2] ?? "").trim() };
}

export function parseMoney(raw: string): bigint | null {
  const token = numberToken(raw);
  if (!token) return null;
  if (/\d{2}\.\d{2}\.\d{4}/.test(raw) && !/[₽]|руб|rub/i.test(raw)) return null;
  return parseDecimal(token.num);
}

export function parseQuantity(raw: string, unitHint?: string): { minor: bigint; unit: string } | null {
  const token = numberToken(raw);
  if (!token) return null;
  const minor = parseDecimal(token.num);
  if (minor == null) return null;
  const unitMatch = token.rest.match(/^(шт\.?|ед\.?|кг|т|м2|м3|месяц\w*|мес\.?|мг|mg|компл\.?|набор\w*|час\.?|чел\w*|усл\.?|уп\.?|л|pcs\.?|pieces?|stk\.?|st(?:ü|ue)ck|hours?|hrs\.?|months?|service|м(?![\p{L}]))/iu);
  const unit = cleanupUnit(unitMatch?.[1] ?? unitHint ?? "шт.");
  return { minor, unit };
}

function cleanupUnit(unit: string): string {
  const u = unit.trim().toLowerCase().replace(/ё/g, "е");
  if (u.startsWith("шт") || /^pcs|^pc\b|^pieces?|^stk|^st(?:ü|ue)ck|^szt|^pi[eè]ce|^unid|^adet|^pz\b|^stuk|^件|^个/.test(u)) return "шт.";
  if (u.startsWith("ед")) return "ед.";
  if (u.startsWith("уп")) return "уп.";
  if (u.startsWith("компл") || u.startsWith("набор") || /^set$|^kit$/.test(u)) return "компл.";
  if (u.startsWith("час") || /^hours?|^hrs|^std|^uur|^saat/.test(u)) return "час";
  if (u.startsWith("месяц") || u.startsWith("мес") || /^months?|^monat|^mois|^mesi|^mes(?:es)?|^ay\b|^miesi|^maand/.test(u)) return "месяц";
  if (u.startsWith("чел") || /^people|^persons?|^kişi|^kisi/.test(u)) return "чел.";
  if (u.startsWith("усл") || /^service|^dienst|^hizmet|^服务/.test(u)) return "усл.";
  if (u.startsWith("мг") || u === "mg") return "мг";
  return unit.trim();
}

const MONTHS: Record<string, string> = {
  january: "01", jan: "01", januar: "01", janvier: "01", gennaio: "01", enero: "01", janeiro: "01", januari: "01", stycznia: "01", ocak: "01",
  february: "02", februar: "02", février: "02", fevrier: "02", febbraio: "02", febrero: "02", fevereiro: "02", februari: "02", lutego: "02", şubat: "02", subat: "02",
  march: "03", märz: "03", marz: "03", mars: "03", marzo: "03", março: "03", marco: "03", maart: "03", marca: "03", mart: "03",
  april: "04", avril: "04", aprile: "04", abril: "04", kwietnia: "04", nisan: "04",
  may: "05", mai: "05", maggio: "05", mayo: "05", maio: "05", mei: "05", maja: "05", mayıs: "05", mayis: "05",
  june: "06", juni: "06", juin: "06", giugno: "06", junio: "06", junho: "06", czerwca: "06", haziran: "06",
  july: "07", juli: "07", juillet: "07", luglio: "07", julio: "07", julho: "07", lipca: "07", temmuz: "07",
  august: "08", août: "08", aout: "08", agosto: "08", sierpnia: "08", augustus: "08", ağustos: "08", agustos: "08",
  september: "09", septembre: "09", settembre: "09", septiembre: "09", setembro: "09", września: "09", wrzesnia: "09", eylül: "09", eylul: "09",
  october: "10", oktober: "10", octobre: "10", ottobre: "10", octubre: "10", outubro: "10", października: "10", pazdziernika: "10", ekim: "10",
  november: "11", novembre: "11", noviembre: "11", novembro: "11", listopada: "11", kasım: "11", kasim: "11",
  december: "12", dezember: "12", décembre: "12", decembre: "12", dicembre: "12", diciembre: "12", dezembro: "12", grudnia: "12", aralık: "12", aralik: "12",
};

export function isQuantityUnit(unit: string): boolean {
  return /шт|компл|набор|час|месяц|^мес\.?$|чел|усл|мг|^mg$|pcs|piece|stk|st(?:ü|ue)ck|szt|pi[eè]ce|unid|adet|pz\b|stuk|hours?|hrs|std|uur|saat|months?|monat|mois|mesi|meses|ay\b|miesi|maand|service|dienst|hizmet|服务|件|个|^km$|^км$/i.test(unit.trim());
}

export function isMoneyUnit(unit: string): boolean {
  return /руб|ндс|₽|rub|eur|usd|vat|mwst|tva|iva|btw|kdv|增值税|€/i.test(unit);
}

export function isDateUnit(unit: string): boolean {
  return /^(дат|date|datum|fecha|data|tarih|日期)/i.test(unit.trim());
}

export function parseDate(raw: string): string | null {
  const numeric = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (numeric?.[1] && numeric[2] && numeric[3]) return `${numeric[3]}-${numeric[2]}-${numeric[1]}`;
  const named = raw.match(/(\d{1,2})\s+(?:de\s+)?(\p{L}+)\s+(?:de\s+)?(\d{4})/u);
  if (named?.[1] && named[2] && named[3]) {
    const month = MONTHS[named[2].toLowerCase()];
    if (month) return `${named[3]}-${month}-${named[1].padStart(2, "0")}`;
  }
  const chinese = raw.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/);
  if (chinese?.[1] && chinese[2] && chinese[3]) return `${chinese[1]}-${chinese[2].padStart(2, "0")}-${chinese[3].padStart(2, "0")}`;
  return null;
}

export function parseInn(raw: string): string | null {
  const m = raw.replace(/\s/g, "").match(/(?:^|\D)(\d{10}|\d{12})(?:\D|$)/);
  return m?.[1] ?? null;
}

/** Contract numbers keep their digits and separators; comparison ignores spaces and a leading №. */
export function parseContractToken(raw: string): string | null {
  const cleaned = raw.replace(/№/g, " ").replace(/инн\s*\/\s*кпп\s*[\d\s/]+/gi, " ").replace(/\s+/g, " ").trim();
  const prefixed = cleaned.match(/([A-Za-zА-Яа-яЁё]{1,12}-\d{1,8}\/\d{2,8})/);
  if (/\d{2}\.\d{2}\.\d{4}/.test(cleaned) && !prefixed) {
    const beside = cleaned.match(/(\d{1,8}\s*[-/]\s*\d{2,8})/);
    return beside?.[1] ? beside[1].replace(/\s+/g, "") : null;
  }
  if (prefixed?.[1]) return prefixed[1].replace(/\s+/g, "");
  const m = cleaned.match(/(\d{1,8}\s*[-/]\s*\d{2,8})/);
  if (m?.[1]) return m[1].replace(/\s+/g, "");
  return null;
}

export type VatBasis = "net" | "gross" | "tax" | "unknown";

/** Whether a money label is the net amount, the gross amount, or the tax itself. */
export function vatBasis(label: string): VatBasis {
  const text = label.toLowerCase().replace(/ё/g, "е");
  if (/^ндс\b|сумма\s+ндс|в\s+т\.?\s*ч\.?\s*ндс|^vat\b|mwst|tva|\biva\b|\bbtw\b|\bkdv\b|增值税|税额/.test(text) && !/без\s*ндс|с\s*ндс|excl|incl|netto|sin\s|hors\s|sem\s|hari[cç]|haric|dahil|without|ohne|zonder|senza|\bbez\b|mit\s|met\s|avec\s|\bcon\s|\bcom\s|不含|含/.test(text)) return "tax";
  if (/без\s*ндс|без\s+налога|excl\.?\s*vat|without|excluding|ohne|zonder|\bbez\b|netto|sin\s|hors\s|senza|sem\s|excl\.?\s*btw|hari[cç]|haric|不含/.test(text)) return "net";
  if (/с\s*ндс|включая\s+ндс|incl\.?\s*vat|including|avec\s|\bcom\s|con\s|brutto|\bmet\s|mit\s+(?:mwst|ндс|vat)|z\s*(?:ндс|vat\b)|ttc|dahil|含/.test(text) && !/不含|zonder|without|ohne|sin\s|sem\s|hors\s|excl|hari[cç]|haric|senza|\bbez\b/.test(text)) return "gross";
  return "unknown";
}

export function productCodes(value: string): string[] {
  const found = value.toUpperCase().match(/[A-ZА-ЯЁ]{1,6}-\d{1,4}/g) ?? [];
  return [...new Set(found)];
}

export function sameToken(a: string, b: string): boolean {
  return a.replace(/[\s№]/g, "").toLowerCase() === b.replace(/[\s№]/g, "").toLowerCase();
}

function groupInt(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatScaled(value: bigint, suffix = ""): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const whole = abs / SCALE;
  let frac = (abs % SCALE).toString().padStart(4, "0").replace(/0+$/, "");
  if (frac.length === 1) frac = frac + "0";
  const body = frac ? `${groupInt(whole)},${frac}` : groupInt(whole);
  const tail = suffix ? ` ${suffix}` : "";
  return `${neg ? "−" : ""}${body}${tail}`;
}

export function formatSigned(value: bigint, suffix = ""): string {
  if (value === 0n) return formatScaled(0n, suffix);
  const sign = value > 0n ? "+" : "−";
  return sign + formatScaled(value > 0n ? value : -value, suffix);
}

export function isTransportText(value: string): boolean {
  return /транспорт|доставк|перевоз/i.test(value);
}

export function fingerprint(texts: string[]): string {
  return texts.map(normText).filter(Boolean).sort().join("|");
}
