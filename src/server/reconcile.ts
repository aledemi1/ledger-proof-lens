import type { CheckResult, CheckStatus, EvidenceReference, Severity } from "@/types/audit";
import type { Box, Fragment, ReadDocument } from "./model";
import {
  detectRole,
  fingerprint,
  formatScaled,
  formatSigned,
  isTransportText,
  normText,
  parseContractToken,
  parseDate,
  parseInn,
  parseMoney,
  parseQuantity,
  sameToken,
  similarText,
  type Role,
} from "./values";

export interface PreparedDoc {
  id: string;
  name: string;
  sha256: string;
  read: ReadDocument;
  isReport: boolean;
}

interface FileProblem {
  fileName: string;
  reason: string;
}

type Parsed =
  | { kind: "money"; minor: bigint }
  | { kind: "quantity"; minor: bigint; unit: string }
  | { kind: "date"; iso: string }
  | { kind: "id"; token: string }
  | { kind: "text"; norm: string }
  | { kind: "missing" };

type DocKind = "report" | "act" | "waybill" | "invoice" | "contract" | "payment" | "other";

interface Fact {
  role: Role;
  label: string;
  raw: string;
  parsed: Parsed;
  item?: string;
  contract?: string;
  counterparty?: string;
  docKind: DocKind;
  docNumber?: string;
  docName: string;
  docText: string;
  documentId: string;
  fragment: Fragment;
}

const prefer: Record<Role, DocKind[]> = {
  line_total: ["act", "waybill", "invoice", "payment", "other", "contract", "report"],
  quantity: ["waybill", "act", "invoice", "other", "payment", "contract", "report"],
  unit_price: ["invoice", "waybill", "act", "other", "contract", "payment", "report"],
  transport: ["act", "invoice", "waybill", "payment", "other", "contract", "report"],
  contract_number: ["contract", "act", "waybill", "invoice", "payment", "other", "report"],
  inn: ["contract", "invoice", "act", "payment", "other", "waybill", "report"],
  counterparty: ["contract", "invoice", "act", "waybill", "payment", "other", "report"],
  item_name: ["waybill", "act", "contract", "invoice", "other", "payment", "report"],
  date: ["act", "waybill", "invoice", "contract", "payment", "other", "report"],
  text: ["act", "waybill", "invoice", "contract", "payment", "other", "report"],
};

export function reconcile(report: PreparedDoc, supporting: PreparedDoc[], unreadable: FileProblem[]): CheckResult[] {
  const reportFacts = buildFacts(report);
  const usable: PreparedDoc[] = [];
  const seen = new Set<string>([report.sha256, fingerprint(report.read.fragments.map((fragment) => fragment.text))]);
  for (const doc of supporting) {
    const fp = fingerprint(doc.read.fragments.map((fragment) => fragment.text));
    if (seen.has(doc.sha256) || (fp && seen.has(fp))) continue;
    seen.add(doc.sha256);
    if (fp) seen.add(fp);
    usable.push(doc);
  }
  const sources = usable.flatMap((doc) => buildFacts(doc));
  const partial = usable.filter((doc) => doc.read.warnings.length);
  return reportFacts.map((fact, index) => toCheck(fact, sources, index + 1, unreadable, partial));
}

function buildFacts(doc: PreparedDoc): Fact[] {
  const kind = doc.isReport ? "report" : detectKind(doc.name, doc.read.text);
  const docNumber = detectNumber(kind, doc.name, doc.read.text);
  const facts: Fact[] = [];
  for (const fragment of doc.read.fragments) {
    if (fragment.shape === "title") continue;
    const label = (fragment.label || fragment.columnHeader || "").trim();
    const role = detectRole(label) ?? (fragment.shape === "line" ? null : null);
    if (fragment.shape === "line") {
      const parsedLine = parseLine(fragment.text);
      if (!parsedLine) continue;
      facts.push(makeFact(doc, kind, docNumber, parsedLine.role, parsedLine.label, parsedLine.value, fragment));
      continue;
    }
    if (!label || fragment.shape === "kv" && !fragment.label) continue;
    const resolved = detectRole(label);
    if (!resolved) {
      if (fragment.shape === "kv" && fragment.text.trim()) {
        facts.push(makeFact(doc, kind, docNumber, "text", label, fragment.text, fragment));
      }
      continue;
    }
    if (resolved === "item_name" && fragment.shape === "table" && fragment.rowLabel && fragment.rowLabel !== fragment.text) continue;
    facts.push(makeFact(doc, kind, docNumber, resolved, label, fragment.text, fragment, fragment.rowLabel));
  }
  return inherit(facts, doc.read.text);
}

function makeFact(
  doc: PreparedDoc,
  docKind: DocKind,
  docNumber: string | undefined,
  role: Role,
  label: string,
  raw: string,
  fragment: Fragment,
  item?: string,
): Fact {
  const fact: Fact = {
    role,
    label,
    raw: raw.trim(),
    parsed: fragment.formulaMissing ? { kind: "missing" } : parseByRole(role, raw, fragment.unitHint),
    docKind,
    docName: doc.name,
    docText: doc.read.text,
    documentId: doc.id,
    fragment,
  };
  if (docNumber) fact.docNumber = docNumber;
  if (item) fact.item = item;
  return fact;
}

function inherit(facts: Fact[], _text: string): Fact[] {
  const contract = facts.find((fact) => fact.role === "contract_number" && fact.parsed.kind === "id");
  const contractToken = contract && contract.parsed.kind === "id" ? contract.parsed.token : facts.find((fact) => fact.docKind === "contract")?.docNumber;
  const party = facts.find((fact) => fact.role === "counterparty")?.raw;
  const named = facts.find((fact) => fact.role === "item_name");
  return facts.map((fact) => {
    const next: Fact = { ...fact };
    if (fact.role === "transport") {
      delete next.item;
    } else if (!next.item && named && (fact.role === "quantity" || fact.role === "line_total" || fact.role === "unit_price" || fact.role === "date")) {
      next.item = named.raw;
    }
    if (!next.contract && contractToken && fact.role !== "contract_number") next.contract = contractToken;
    if (!next.counterparty && party && fact.role !== "counterparty") next.counterparty = party;
    return next;
  });
}

function parseByRole(role: Role, raw: string, unitHint?: string): Parsed {
  if (role === "line_total" || role === "unit_price" || role === "transport") {
    const money = parseMoney(raw);
    return money == null ? { kind: "text", norm: normText(raw) } : { kind: "money", minor: money };
  }
  if (role === "quantity") {
    const qty = parseQuantity(raw, unitHint);
    return qty == null ? { kind: "text", norm: normText(raw) } : { kind: "quantity", minor: qty.minor, unit: qty.unit };
  }
  if (role === "date") {
    const date = parseDate(raw);
    return date == null ? { kind: "text", norm: normText(raw) } : { kind: "date", iso: date };
  }
  if (role === "inn") {
    const inn = parseInn(raw);
    return inn == null ? { kind: "text", norm: normText(raw) } : { kind: "id", token: inn };
  }
  if (role === "contract_number") {
    const token = parseContractToken(raw);
    return token == null ? { kind: "text", norm: normText(raw) } : { kind: "id", token: token };
  }
  return { kind: "text", norm: normText(raw) };
}

function parseLine(text: string): { role: Role; label: string; value: string } | null {
  const colon = text.match(/^(.{2,80}?)[:]\s+(.+)$/);
  if (colon?.[1] && colon[2]) {
    const role = detectRole(colon[1]);
    if (role) return { role, label: colon[1].trim(), value: colon[2].trim() };
  }
  const contract = text.match(/договор[^\d№]{0,24}№\s*([0-9A-Za-zА-Яа-я\-\/]+)/i);
  if (contract?.[1]) return { role: "contract_number", label: "Номер договора", value: contract[1] };
  const inn = text.match(/инн\s*[:№]?\s*(\d{10}|\d{12})/i);
  if (inn?.[1]) return { role: "inn", label: "ИНН", value: inn[1] };
  return null;
}

function toCheck(fact: Fact, sources: Fact[], index: number, unreadable: FileProblem[], partial: PreparedDoc[]): CheckResult {
  const reportReference = reference(fact.documentId, fact.fragment, fact.raw || fact.label);
  const base = {
    id: `c${index}`,
    fieldName: fact.fragment.rowLabel && fact.fragment.columnHeader ? `${fact.fragment.rowLabel} — ${fact.label}` : fact.label,
    reportValue: fact.parsed.kind === "missing" ? "нет вычисленного значения" : fact.raw,
    reviewerStatus: "pending" as const,
    reviewerComment: "",
    reportReference,
  };
  if (fact.parsed.kind === "missing") {
    return finish(base, {
      sourceValue: null,
      discrepancy: null,
      status: "needs_review",
      severity: "medium",
      explanation: `В отчёте для «${fact.label}» формула без сохранённого результата. Пустое значение не принято за ноль. Откройте файл в редакторе и сохраните вычисленные значения.`,
      evidenceReferences: [],
    });
  }
  const found = sources.filter((source) => confirms(fact, source));
  if (!found.length) {
    const blocked = unreadable.length > 0 || partial.some((doc) => doc.read.warnings.length);
    if (fact.role === "text") {
      const exact = sources.filter((source) => source.parsed.kind === "text" && fact.parsed.kind === "text" && source.parsed.norm === fact.parsed.norm);
      if (exact.length === 1 && exact[0]) {
        return matched(base, fact, [exact[0]], "Совпадает по точному тексту.");
      }
    }
    if (blocked) {
      const why = [
        ...unreadable.map((file) => `«${file.fileName}»: ${file.reason}`),
        ...partial.flatMap((doc) => doc.read.warnings.map((warning) => `«${doc.name}»: ${warning}`)),
      ];
      return finish(base, {
        sourceValue: null,
        discrepancy: null,
        status: "needs_review",
        severity: "medium",
        explanation: `Подтверждение «${fact.label}» не найдено в прочитанных документах. Проверка неполная: ${why.join(" ")} В непрочитанном файле могло быть подтверждение.`,
        evidenceReferences: [],
      });
    }
    if (fact.role === "text") {
      return finish(base, {
        sourceValue: null,
        discrepancy: null,
        status: "needs_review",
        severity: "medium",
        explanation: `Формулировка «${fact.label}» не сопоставлена однозначно. Для смыслового сравнения нужен ключ языковой модели (AI_API_KEY или LOVABLE_API_KEY) либо ручная проверка.`,
        evidenceReferences: [],
      });
    }
    return finish(base, {
      sourceValue: null,
      discrepancy: null,
      status: "not_found",
      severity: fact.role === "line_total" || fact.role === "quantity" || fact.role === "transport" ? "high" : "medium",
      explanation: `В прочитанном комплекте нет подтверждения «${fact.label}» (${fact.raw}). ${askFor(fact.role)} Посторонние документы с другими операциями не использованы.`,
      evidenceReferences: [],
    });
  }

  if (canSum(fact.role, found)) {
    return summed(base, fact, found);
  }

  const groups = groupByValue(found);
  if (groups.length > 1) {
    const ordered = found.slice().sort((a, b) => rank(fact.role, a) - rank(fact.role, b));
    const shown = uniqueRaws(ordered).slice(0, 3).join(" и ");
    return finish(base, {
      sourceValue: shown,
      discrepancy: null,
      status: "needs_review",
      severity: "medium",
      explanation: `По «${fact.label}» первичные документы противоречат друг другу: ${ordered
        .map((source) => `${source.raw} (${source.docName})`)
        .join("; ")}. В отчёте указано ${fact.raw}. Нужно уточнить, какой документ относится к этой операции.`,
      evidenceReferences: ordered.map((source) => reference(source.documentId, source.fragment, source.raw)),
    });
  }

  const group = groups[0] ?? [];
  const same = valuesEqual(fact.parsed, group[0]?.parsed);
  const ordered = group.slice().sort((a, b) => rank(fact.role, a) - rank(fact.role, b));
  if (same) return matched(base, fact, ordered, `Источник по той же операции подтверждает «${fact.label}».`);
  const primary = ordered[0];
  if (!primary) {
    return finish(base, {
      sourceValue: null,
      discrepancy: null,
      status: "not_found",
      severity: "medium",
      explanation: `Подтверждение «${fact.label}» не найдено.`,
      evidenceReferences: [],
    });
  }
  const delta = deltaOf(fact.parsed, primary.parsed);
  const mismatch = {
    sourceValue: primary.raw,
    discrepancy: delta,
    status: "mismatch" as const,
    severity: (fact.role === "line_total" || fact.role === "quantity" || fact.role === "transport" || fact.role === "unit_price" ? "high" : "medium") as Severity,
    explanation: `В отчёте ${fact.raw}, в «${primary.docName}» — ${primary.raw}${delta ? `. Разница ${delta} (отчёт минус первичный документ)` : ""}. Уточните «${fact.label}» и при необходимости запросите исправленный документ.`,
    evidenceReferences: ordered.map((source) => reference(source.documentId, source.fragment, source.raw)),
  };
  const unit = unitOf(fact.parsed);
  return finish(base, unit ? { ...mismatch, unit } : mismatch);
}

function matched(base: Omit<CheckResult, "sourceValue" | "discrepancy" | "status" | "severity" | "explanation" | "evidenceReferences">, fact: Fact, sources: Fact[], why: string): CheckResult {
  const primary = sources[0];
  return finish(base, {
    sourceValue: primary?.raw ?? fact.raw,
    discrepancy: null,
    status: "match",
    severity: "low",
    explanation: why,
    evidenceReferences: sources.map((source) => reference(source.documentId, source.fragment, source.raw)),
  });
}

function summed(base: Omit<CheckResult, "sourceValue" | "discrepancy" | "status" | "severity" | "explanation" | "evidenceReferences">, fact: Fact, sources: Fact[]): CheckResult {
  const unit = fact.parsed.kind === "quantity" ? fact.parsed.unit : "₽";
  let total = 0n;
  for (const source of sources) {
    if (source.parsed.kind === "money" || source.parsed.kind === "quantity") total += source.parsed.minor;
  }
  const reportMinor = fact.parsed.kind === "money" || fact.parsed.kind === "quantity" ? fact.parsed.minor : null;
  const same = reportMinor != null && reportMinor === total;
  const delta = reportMinor == null ? null : formatSigned(reportMinor - total, unit === "₽" ? "₽" : unit);
  const parts = sources.map((source) => `${source.raw} (${source.docName})`).join(", ");
  return finish(base, {
    sourceValue: formatScaled(total, unit === "₽" ? "₽" : unit),
    discrepancy: same ? null : delta,
    status: same ? "match" : "mismatch",
    severity: same ? "low" : "high",
    explanation: `Позиция складывается из поставок: ${parts}. Итого ${formatScaled(total, unit === "₽" ? "₽" : unit)}. Повтор одного и того же документа в сумму не входит.${same ? "" : " Уточните, все ли частичные поставки приложены."}`,
    evidenceReferences: sources.map((source) => reference(source.documentId, source.fragment, source.raw, "слагаемое")),
  });
}

function confirms(report: Fact, source: Fact): boolean {
  if (source.documentId === report.documentId) return false;
  if (source.parsed.kind === "missing" || report.parsed.kind === "missing") return false;
  if (!sameRole(report, source)) return false;
  if (report.contract && source.contract && !sameToken(report.contract, source.contract)) return false;
  if (report.role === "line_total" || report.role === "unit_price") {
    if (source.docKind === "contract" && !/договор/i.test(report.label)) return false;
  }
  if (needsItem(report.role) && report.item) {
    if (source.item) {
      if (!similarText(report.item, source.item)) return false;
    } else if (!similarText(report.item, source.docText)) return false;
  }
  if (report.role === "quantity" && report.parsed.kind === "quantity" && source.parsed.kind === "quantity") {
    if (!sameUnit(report.parsed.unit, source.parsed.unit)) return false;
  }
  return true;
}

function sameRole(report: Fact, source: Fact): boolean {
  if (report.role === "transport") {
    return source.role === "transport" || (source.role === "line_total" && isTransportText(`${source.label} ${source.item ?? ""} ${source.raw}`));
  }
  return report.role === source.role;
}

function needsItem(role: Role): boolean {
  return role === "quantity" || role === "line_total" || role === "unit_price" || role === "date" || role === "item_name";
}

function canSum(role: Role, sources: Fact[]): boolean {
  if (sources.length < 2) return false;
  if (role !== "quantity" && role !== "line_total") return false;
  const kinds = new Set(sources.map((source) => source.docKind));
  if (kinds.size !== 1) return false;
  const kind = sources[0]?.docKind;
  if (kind !== "waybill" && kind !== "act") return false;
  const numbers = sources.map((source) => source.docNumber ?? source.documentId);
  if (new Set(numbers).size < sources.length) return false;
  const values = new Set(sources.map((source) => valueKey(source.parsed)));
  return values.size > 1;
}

function groupByValue(sources: Fact[]): Fact[][] {
  const groups = new Map<string, Fact[]>();
  for (const source of sources) {
    const key = valueKey(source.parsed);
    const list = groups.get(key) ?? [];
    list.push(source);
    groups.set(key, list);
  }
  return [...groups.values()];
}

function valueKey(parsed: Parsed): string {
  if (parsed.kind === "money" || parsed.kind === "quantity") return `${parsed.kind}:${parsed.minor.toString()}`;
  if (parsed.kind === "date") return parsed.iso;
  if (parsed.kind === "id") return parsed.token.toLowerCase();
  if (parsed.kind === "text") return parsed.norm;
  return "missing";
}

function valuesEqual(a: Parsed, b: Parsed | undefined): boolean {
  if (!b) return false;
  if (a.kind === "money" && b.kind === "money") return a.minor === b.minor;
  if (a.kind === "quantity" && b.kind === "quantity") return a.minor === b.minor && sameUnit(a.unit, b.unit);
  if (a.kind === "date" && b.kind === "date") return a.iso === b.iso;
  if (a.kind === "id" && b.kind === "id") return sameToken(a.token, b.token);
  if (a.kind === "text" && b.kind === "text") return a.norm === b.norm || similarText(a.norm, b.norm);
  return false;
}

function deltaOf(report: Parsed, source: Parsed): string | null {
  if (report.kind === "money" && source.kind === "money") return formatSigned(report.minor - source.minor, "₽");
  if (report.kind === "quantity" && source.kind === "quantity") return formatSigned(report.minor - source.minor, report.unit);
  return null;
}

function unitOf(parsed: Parsed): string | undefined {
  if (parsed.kind === "quantity") return parsed.unit;
  if (parsed.kind === "money") return "₽";
  return undefined;
}

function sameUnit(a: string, b: string): boolean {
  const left = a.toLowerCase().replace(/ё/g, "е").replace(/\./g, "");
  const right = b.toLowerCase().replace(/ё/g, "е").replace(/\./g, "");
  return left === right;
}

function rank(role: Role, fact: Fact): number {
  const order = prefer[role];
  const index = order.indexOf(fact.docKind);
  return index === -1 ? 99 : index;
}

function uniqueRaws(facts: Fact[]): string[] {
  const out: string[] = [];
  for (const fact of facts) if (!out.includes(fact.raw)) out.push(fact.raw);
  return out;
}

function askFor(role: Role): string {
  if (role === "transport") return "Запросите счёт, акт или платёжный документ на перевозку.";
  if (role === "line_total" || role === "unit_price") return "Запросите акт, накладную или счёт по этой поставке.";
  if (role === "quantity") return "Запросите накладную или акт с количеством по этой позиции.";
  if (role === "date") return "Запросите документ с датой этой операции.";
  return "Запросите первичный документ, в котором есть это значение.";
}

function reference(documentId: string, fragment: Fragment, quote: string, note?: string): EvidenceReference {
  const box = tighten(fragment, quote);
  const ref: EvidenceReference = {
    documentId,
    pageNumber: fragment.pageNumber,
    sourceText: (quote || fragment.text).slice(0, 240),
    locationInDocument: fragment.anchor,
    locationLabel: fragment.locationLabel,
  };
  if (box) ref.box = box;
  if (note) ref.note = note;
  return ref;
}

function tighten(fragment: Fragment, value: string): Box | undefined {
  const tokens = fragment.tokens;
  if (!tokens?.length) return fragment.box;
  const compact = (input: string) => input.replace(/[\s\u00A0₽]/g, "").replace(/руб\.?/gi, "").toLowerCase();
  const target = compact(value);
  if (target.length < 2) return fragment.box;
  for (let start = 0; start < tokens.length; start += 1) {
    let acc = "";
    const group = [];
    for (let index = start; index < Math.min(tokens.length, start + 8); index += 1) {
      const token = tokens[index];
      if (!token) break;
      group.push(token);
      acc += token.text;
      const got = compact(acc);
      if (got.includes(target)) {
        return union(group.map((item) => item.box));
      }
    }
  }
  return fragment.box;
}

function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

function finish(
  base: Omit<CheckResult, "sourceValue" | "discrepancy" | "status" | "severity" | "explanation" | "evidenceReferences" | "unit">,
  extra: {
    sourceValue: string | null;
    discrepancy: string | null;
    status: CheckStatus;
    severity: Severity;
    explanation: string;
    evidenceReferences: EvidenceReference[];
    unit?: string;
  },
): CheckResult {
  const check: CheckResult = { ...base, ...extra };
  if (!extra.unit) delete check.unit;
  return check;
}

function detectKind(name: string, text: string): DocKind {
  const filename = name.toLowerCase();
  if (/наклад/.test(filename)) return "waybill";
  if (/акт/.test(filename)) return "act";
  if (/сч[её]т/.test(filename)) return "invoice";
  if (/договор/.test(filename)) return "contract";
  if (/плат/.test(filename)) return "payment";
  const head = text.slice(0, 600).toLowerCase();
  if (/наклад/.test(head)) return "waybill";
  if (/(^|[^\p{L}])акт(?=[^\p{L}]|$)/iu.test(head)) return "act";
  if (/сч[её]т/.test(head)) return "invoice";
  if (/плат[её]ж/.test(head)) return "payment";
  if (/договор/.test(head)) return "contract";
  return "other";
}

function detectNumber(kind: DocKind, name: string, text: string): string | undefined {
  const blob = `${name}\n${text.slice(0, 1800)}`;
  if (kind === "contract") return parseContractToken(blob) ?? undefined;
  const explicit = blob.match(/(?:накладн\w*|акт|сч[её]т)\s*№\s*([0-9A-Za-zА-Яа-я\-\/]+)/i);
  if (explicit?.[1]) return explicit[1].replace(/[.,;]+$/, "");
  const fromName = name.match(/(\d{1,6})/);
  return fromName?.[1];
}

export function duplicateNames(report: PreparedDoc, supporting: PreparedDoc[]): string[] {
  const seen = new Set<string>([report.sha256, fingerprint(report.read.fragments.map((fragment) => fragment.text))]);
  const names: string[] = [];
  for (const doc of supporting) {
    const fp = fingerprint(doc.read.fragments.map((fragment) => fragment.text));
    if (seen.has(doc.sha256) || (fp && seen.has(fp))) names.push(doc.name);
    else {
      seen.add(doc.sha256);
      if (fp) seen.add(fp);
    }
  }
  return names;
}
