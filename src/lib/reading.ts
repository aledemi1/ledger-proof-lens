import type { EvidenceReference } from "@/types/audit";

export interface ChosenReading {
  sourceValue: string;
  discrepancy: string | null;
  note: string;
}

const SCALE = 10000n;

function decimal(raw: string): bigint | null {
  const token = raw.replace(/[\s\u00A0]/g, "").match(/-?\d[\d.,]*/)?.[0];
  if (!token) return null;
  let value = token;
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    value = lastComma > lastDot ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const parts = value.split(",");
    const grouped = parts.slice(1).every((part) => part.length === 3);
    value = parts.length > 1 && grouped && (parts[1]?.length ?? 0) === 3 ? parts.join("") : value.replace(",", ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const body = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = body.split(".");
  if (whole == null) return null;
  const minor = BigInt(whole) * SCALE + BigInt((fraction + "0000").slice(0, 4));
  return negative ? -minor : minor;
}

function signed(value: bigint, suffix: string): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = (abs / SCALE).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const fraction = (abs % SCALE).toString().padStart(4, "0").replace(/0+$/, "");
  return `${negative ? "−" : "+"}${fraction ? `${whole},${fraction.length === 1 ? `${fraction}0` : fraction}` : whole} ${suffix}`;
}

function date(raw: string): string | null {
  const match = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

/** Compares the report value with a fragment the reviewer picked. Does not assign a status. */
export function readingAgainst(reportValue: string, source: EvidenceReference): ChosenReading {
  const quote = source.sourceText.trim();
  const reportDate = date(reportValue);
  const sourceDate = date(quote);
  if (reportDate && sourceDate) {
    return { sourceValue: quote, discrepancy: null, note: reportDate === sourceDate ? "Даты совпадают." : "Даты различаются." };
  }
  if (/\d{2}\.\d{2}\.\d{4}/.test(reportValue) || /\d{2}\.\d{2}\.\d{4}/.test(quote)) {
    return { sourceValue: quote, discrepancy: null, note: "Фрагмент сохранён как выбранный источник." };
  }
  const left = decimal(reportValue);
  const right = decimal(quote);
  if (left != null && right != null) {
    const same = left === right;
    const money = /₽|руб/i.test(`${reportValue} ${quote}`) || !/[а-яa-z]/i.test(reportValue);
    return {
      sourceValue: quote,
      discrepancy: same ? null : signed(left - right, money ? "₽" : ""),
      note: same ? "Выбранный фрагмент содержит то же значение." : "Значение в отчёте и в выбранном фрагменте различается.",
    };
  }
  return { sourceValue: quote, discrepancy: null, note: "Фрагмент сохранён как выбранный источник. Число из него автоматически не извлечено." };
}
