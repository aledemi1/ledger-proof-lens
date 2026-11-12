import type { PreparedDoc } from "../reconcile";
import { parseMoney } from "../values";

export interface Scope {
  start: string | null;
  end: string | null;
  contracts: string[];
}

export interface DocFacts {
  dates: string[];
  contracts: string[];
}

const MONTH = "январ\\w*|феврал\\w*|март\\w*|апрел\\w*|ма[йя]\\w*|июн\\w*|июл\\w*|август\\w*|сентябр\\w*|октябр\\w*|ноябр\\w*|декабр\\w*";

function monthNumber(word: string): number | null {
  const stem = word.toLowerCase().replace(/ё/g, "е").slice(0, 3);
  const months: Record<string, number> = { янв: 1, фев: 2, мар: 3, апр: 4, май: 5, мая: 5, июн: 6, июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12 };
  return months[stem] ?? null;
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function numericDates(text: string): string[] {
  return [...text.matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)].flatMap((match) => {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (!day || month < 1 || month > 12 || year < 1990) return [];
    return [iso(year, month, day)];
  });
}

function namedDates(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(new RegExp(`(\\d{1,2})\\s+(${MONTH})\\s+(\\d{4})`, "gi"))) {
    const month = monthNumber(match[2] ?? "");
    const day = Number(match[1]);
    const year = Number(match[3]);
    if (month && day && year) found.push(iso(year, month, day));
  }
  for (const match of text.matchAll(new RegExp(`(?:^|[^\\p{L}])(${MONTH})\\s+(\\d{4})`, "giu"))) {
    const month = monthNumber(match[1] ?? "");
    const year = Number(match[2]);
    if (month && year) found.push(iso(year, month, 15));
  }
  return found;
}

function contractsIn(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\d{2}\/\d{2}\/\d{2}-\d{2}/g)) found.add(match[0]);
  for (const match of text.matchAll(/(?:договор\w*|контракт\w*|основани\w*|проект)\s*[:№]?\s*([A-Za-zА-Яа-яЁё]{0,12}-?\d[\d./-]{3,}\d)/gi)) {
    const token = (match[1] ?? "").replace(/\s+/g, "");
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(token)) found.add(token);
  }
  return [...found];
}

function contractKey(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, "");
}

/** The period and contract written in the report, whichever form they take. */
export function scopeOf(text: string): Scope {
  const contracts = contractsIn(text);
  const range = text.match(new RegExp(`(${MONTH})\\s+(\\d{4})\\s*(?:г\\.?\\s*)?[—–-]\\s*(${MONTH})\\s+(\\d{4})`, "i"));
  if (range) {
    const startMonth = monthNumber(range[1] ?? "");
    const endMonth = monthNumber(range[3] ?? "");
    const startYear = Number(range[2]);
    const endYear = Number(range[4]);
    if (startMonth && endMonth && startYear && endYear) {
      return { start: iso(startYear, startMonth, 1), end: iso(endYear, endMonth, lastDay(endYear, endMonth)), contracts };
    }
  }
  const dates = [...numericDates(text), ...namedDates(text)].sort();
  return { start: dates[0] ?? null, end: dates.at(-1) ?? null, contracts };
}

export function documentFacts(text: string): DocFacts {
  return { dates: [...new Set([...numericDates(text), ...namedDates(text)])], contracts: contractsIn(text) };
}

/** Why a document cannot confirm the report row. Missing date or contract is not a reason. */
export function exclusionReason(facts: DocFacts, scope: Scope): string | null {
  if (scope.contracts.length && facts.contracts.length) {
    const wanted = new Set(scope.contracts.map(contractKey));
    if (!facts.contracts.some((contract) => wanted.has(contractKey(contract)))) return "другой договор";
  }
  if (scope.start && scope.end && facts.dates.length && !facts.dates.some((date) => date >= scope.start! && date <= scope.end!)) return "вне периода";
  return null;
}

const GENERIC = /^(затрат\w*|всего|итого|сумм\w*|рубл\w*|этап\w*|период\w*|документ\w*|отч[её]т\w*|стать\w*|показател\w*|начислен\w*|общая|общий|общие)$/u;

function stems(name: string): string[] {
  return name.toLowerCase().replace(/ё/g, "е").split(/[^\p{L}\p{N}]+/u).flatMap((word) => {
    if (word.length < 5 || GENERIC.test(word)) return [];
    return [word.slice(0, word.length <= 7 ? 5 : 7)];
  });
}

export interface GatheredPart {
  fragmentId: string;
  quote: string;
  where: string;
  dates: string[];
  contracts: string[];
}

/** Monthly or separate documents of one article, when the report total itself is not written in them. */
function isPureTotal(name: string): boolean {
  const word = name.toLowerCase().replace(/ё/g, "е").split(/[^\p{L}\p{N}]+/u).find((item) => item.length >= 4);
  return word === "итого" || word === "всего";
}

export function gatherParts(name: string, reportValue: string, docs: PreparedDoc[]): GatheredPart[] {
  if (isPureTotal(name) || /(?:^|[^\p{L}\p{N}])(счет|счёт|субсчет|субсчёт|код)\s*\d+/iu.test(name)) return [];
  const wanted = stems(name);
  const reportMoney = parseMoney(reportValue);
  if (!wanted.length || reportMoney == null) return [];
  const parts: GatheredPart[] = [];
  for (const doc of docs) {
    const facts = documentFacts(`${doc.name}\n${doc.read.fragments.map((fragment) => fragment.text).join("\n")}`);
    const paired = pairedAmount(doc.read.fragments, wanted);
    const candidates = paired ? [paired] : doc.read.fragments.flatMap((fragment) => {
      const blob = `${fragment.text} ${fragment.label ?? ""} ${fragment.columnHeader ?? ""} ${fragment.rowLabel ?? ""}`.toLowerCase().replace(/ё/g, "е");
      if (!wanted.some((stem) => blob.includes(stem))) return [];
      return [fragment];
    });
    for (const fragment of candidates) {
      const amounts = [...new Set(moneyTokens(fragment.text))];
      if (amounts.length !== 1 || amounts[0] === reportMoney) continue;
      parts.push({
        fragmentId: `${doc.id}:${fragment.id}`,
        quote: fragment.text,
        where: [doc.name, fragment.columnHeader || fragment.label || fragment.locationLabel].filter(Boolean).join(", "),
        dates: facts.dates,
        contracts: facts.contracts,
      });
    }
  }
  return parts;
}

/** A header row followed by a value row, paired by position. Keeps the column whose header matches the article. */
function pairedAmount(fragments: PreparedDoc["read"]["fragments"], wanted: string[]): PreparedDoc["read"]["fragments"][number] | null {
  const firstMoney = fragments.findIndex((fragment) => moneyTokens(fragment.text).length === 1);
  if (firstMoney < 1) return null;
  const headers = [];
  for (let index = firstMoney - 1; index >= 0; index -= 1) {
    const text = fragments[index]?.text ?? "";
    if (!text.trim() || moneyTokens(text).length || /\d{2}\/\d{2}\/\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}|документ\s*:/i.test(text)) break;
    headers.unshift(fragments[index]);
  }
  if (headers.length < 2) return null;
  const values = fragments.slice(firstMoney, firstMoney + headers.length);
  const column = headers.findIndex((header) => wanted.some((stem) => (header?.text ?? "").toLowerCase().replace(/ё/g, "е").includes(stem)));
  const value = column >= 0 ? values[column] : undefined;
  if (!value || moneyTokens(value.text).length !== 1) return null;
  return value;
}

function moneyTokens(quote: string): bigint[] {
  const trimmed = quote.trim();
  if (/^[\d\s\u00A0.,]+$/.test(trimmed)) {
    const whole = parseMoney(trimmed);
    return whole == null ? [] : [whole];
  }
  const amounts: bigint[] = [];
  for (const match of quote.matchAll(/\d{1,3}(?:[ \u00A0,]\d{3})+(?:[.,]\d+)?|\d+[.,]\d{2}/g)) {
    const value = parseMoney(match[0]);
    if (value != null) amounts.push(value);
  }
  return amounts;
}

export function rowTokens(name: string): string[] {
  return name.toLowerCase().replace(/ё/g, "е").split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4 && !/^(итого|всего|сумма|суммы|затрат|затраты)$/.test(word) || /^\d{4}$/.test(word));
}

export function sameRow(totalName: string, partName: string): boolean {
  const tokens = rowTokens(totalName).filter((word) => !/^(итого|всего|сумма|суммы)$/.test(word));
  if (!tokens.length) return false;
  const part = partName.toLowerCase().replace(/ё/g, "е");
  return tokens.every((token) => part.includes(token));
}

