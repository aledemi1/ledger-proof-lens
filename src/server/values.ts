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
  { role: "inn", re: /(^|[^\p{L}\p{N}])инн(?=[^\p{L}\p{N}]|$)/iu },
  { role: "contract_number", re: /договор/i },
  { role: "counterparty", re: /поставщик|контрагент|исполнитель|покупатель|заказчик|грузоотправитель|грузополучатель/i },
  { role: "transport", re: /транспорт|доставк|перевоз/i },
  { role: "unit_price", re: /цена|тариф|стоимость\s+единиц|за\s+единиц/i },
  { role: "quantity", re: /кол-?во|количество|поставлено|число\s+единиц|объ[её]м/i },
  { role: "line_total", re: /стоимость|сумма|итого|всего/i },
  { role: "date", re: /(^|[^\p{L}])дата(?=[^\p{L}]|$)/iu },
  { role: "item_name", re: /наименование|номенклатур|товар|оборудован|услуг/i },
];

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
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const ta = new Set(x.split(" ").filter((w) => w.length > 2));
  const tb = new Set(y.split(" ").filter((w) => w.length > 2));
  if (!ta.size || !tb.size) return false;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter += 1;
  return inter / Math.min(ta.size, tb.size) >= 0.6;
}

export function parseDecimal(raw: string): bigint | null {
  let s = raw.replace(/[\s\u00A0]/g, "").replace(",", ".");
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
    .match(/(-?\d{1,3}(?:[ \u00A0]\d{3})+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?)(.*)$/s);
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
  const unitMatch = token.rest.match(/^(шт\.?|ед\.?|кг|т|м2|м3|м|л|уп\.?)/i);
  const unit = cleanupUnit(unitMatch?.[1] ?? unitHint ?? "шт.");
  return { minor, unit };
}

function cleanupUnit(unit: string): string {
  const u = unit.trim().toLowerCase().replace(/ё/g, "е");
  if (u.startsWith("шт")) return "шт.";
  if (u.startsWith("ед")) return "ед.";
  if (u.startsWith("уп")) return "уп.";
  return unit.trim();
}

export function parseDate(raw: string): string | null {
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m?.[1] || !m[2] || !m[3]) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseInn(raw: string): string | null {
  const m = raw.replace(/\s/g, "").match(/(?:^|\D)(\d{10}|\d{12})(?:\D|$)/);
  return m?.[1] ?? null;
}

/** Contract numbers keep their digits and separators; comparison ignores spaces and a leading №. */
export function parseContractToken(raw: string): string | null {
  const cleaned = raw.replace(/№/g, " ").replace(/\s+/g, " ").trim();
  const m = cleaned.match(/(\d{1,8}\s*[-/]\s*\d{2,8})/);
  if (m?.[1]) return m[1].replace(/\s+/g, "");
  const digits = cleaned.match(/(\d{4,})/);
  return digits?.[1] ?? null;
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
