import type { CheckResult, CheckStatus, EvidenceReference, Severity } from "@/types/audit";
import type { Box, Fragment, ReadDocument } from "./model";
import {
  blankSignature,
  contractMentioned,
  convertMoney,
  documentDate,
  kitFactors,
  moneyBasis,
  parseRestatedDeadline,
  parseRestatedPrice,
  parseContractPrice,
  parseQtyBeforeUnit,
  parseShipmentRow,
  parseStatedTotal,
  periodEnd,
  sameItem,
} from "./measure";
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
  productCodes,
  sameToken,
  similarText,
  type Role,
  type VatBasis,
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

/** Roles a language model assigned to labels the rule dictionary does not know, keyed by normalized label. */
export type RoleHints = Map<string, Role>;

export interface UnknownLabel {
  label: string;
  sample: string;
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
  viaModel?: boolean;
  basis?: VatBasis;
  operationDate?: string;
  cutoff?: string;
  net?: boolean;
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

export function reconcile(report: PreparedDoc, supporting: PreparedDoc[], unreadable: FileProblem[], hints: RoleHints = new Map()): CheckResult[] {
  const reportFacts = buildFacts(report, hints);
  const usable: PreparedDoc[] = [];
  const seen = new Set<string>([report.sha256, fingerprint(report.read.fragments.map((fragment) => fragment.text))]);
  for (const doc of supporting) {
    const fp = fingerprint(doc.read.fragments.map((fragment) => fragment.text));
    if (seen.has(doc.sha256) || (fp && seen.has(fp))) continue;
    seen.add(doc.sha256);
    if (fp) seen.add(fp);
    usable.push(doc);
  }
  const sources = usable.flatMap((doc) => buildFacts(doc, hints));
  const partial = usable.filter((doc) => doc.read.warnings.length);
  const docs = usable.flatMap((doc) => {
    const fragment = doc.read.fragments[0];
    return fragment ? [{ id: doc.id, name: doc.name, text: doc.read.text, fragment }] : [];
  });
  return reportFacts.map((fact, index) => noteModel(toCheck(fact, sources, reportFacts, docs, index + 1, unreadable, partial), fact, sources));
}

/** Labels with values that the rule dictionary cannot classify; only these are sent to a model. */
export function unknownLabels(docs: PreparedDoc[]): UnknownLabel[] {
  const out = new Map<string, UnknownLabel>();
  const add = (label: string, sample: string) => {
    const key = normText(label);
    if (!key || detectRole(label) || out.has(key) || !sample.trim()) return;
    out.set(key, { label: label.trim(), sample: sample.trim().slice(0, 80) });
  };
  for (const doc of docs) {
    for (const fragment of doc.read.fragments) {
      if (fragment.shape === "title") continue;
      if (fragment.shape === "line") {
        const colon = fragment.text.match(/^(.{2,80}?)[:]\s+(.+)$/);
        if (colon?.[1] && colon[2]) add(colon[1], colon[2]);
        continue;
      }
      const label = fragment.shape === "kv" ? fragment.label : fragment.label || fragment.columnHeader;
      if (label) add(label, fragment.text);
    }
  }
  return [...out.values()];
}

function roleFromUnit(label: string, raw: string, unitHint?: string): { role: Role; viaModel: boolean } | null {
  if (unitHint && /^дат/i.test(unitHint) && parseDate(raw)) return { role: "date", viaModel: false };
  if (unitHint && /шт|компл|час|месяц|чел|усл|мг/i.test(unitHint) && parseQuantity(raw, unitHint)) return { role: "quantity", viaModel: false };
  if (unitHint && /руб|ндс|₽/i.test(unitHint) && parseMoney(raw) != null) return { role: /цена/i.test(label) ? "unit_price" : "line_total", viaModel: false };
  return null;
}

function resolveRole(label: string, raw: string, hints: RoleHints, unitHint?: string): { role: Role; viaModel: boolean } | null {
  if ((/дата/i.test(label) || /срок/i.test(label)) && parseDate(raw)) return { role: "date", viaModel: false };
  const measured = roleFromUnit(label, raw, unitHint);
  if (measured && unitHint && !/руб|ндс|₽/i.test(unitHint)) return measured;
  const known = detectRole(label);
  if (known) {
    const parsed = parseByRole(known, raw, unitHint);
    const textual = known === "counterparty" || known === "item_name";
    if (textual || parsed.kind !== "text") return { role: known, viaModel: false };
  }
  const fromUnit = roleFromUnit(label, raw, unitHint);
  if (fromUnit) return fromUnit;
  const hinted = hints.get(normText(label));
  if (!hinted || hinted === "text") return null;
  const parsed = parseByRole(hinted, raw, unitHint);
  const needsParse = hinted !== "counterparty" && hinted !== "item_name";
  if (needsParse && parsed.kind === "text") return null;
  return { role: hinted, viaModel: true };
}

function buildFacts(doc: PreparedDoc, hints: RoleHints): Fact[] {
  const kind = doc.isReport ? "report" : detectKind(doc.name, doc.read.text);
  const docNumber = detectNumber(kind, doc.name, doc.read.text);
  const facts: Fact[] = [];
  for (const fragment of doc.read.fragments) {
    if (fragment.shape === "title") continue;
    const label = (fragment.label || fragment.columnHeader || "").trim();
    if (fragment.shape === "line") {
      const parsedLine = parseLine(fragment.text, hints);
      if (!parsedLine) continue;
      facts.push(makeFact(doc, kind, docNumber, parsedLine.role, parsedLine.label, parsedLine.value, fragment, undefined, parsedLine.viaModel));
      continue;
    }
    if (!label || fragment.shape === "kv" && !fragment.label) continue;
    if (fragment.formulaMissing) {
      facts.push(makeFact(doc, kind, docNumber, detectRole(label) ?? "line_total", label, fragment.text, fragment, fragment.rowLabel));
      continue;
    }
    const resolved = resolveRole(label, fragment.text, hints, fragment.unitHint);
    if (!resolved) {
      if (fragment.shape === "kv" && fragment.text.trim()) {
        facts.push(makeFact(doc, kind, docNumber, "text", label, fragment.text, fragment));
      }
      continue;
    }
    if (resolved.role === "item_name" && fragment.shape === "table" && fragment.rowLabel && fragment.rowLabel !== fragment.text) continue;
    facts.push(makeFact(doc, kind, docNumber, resolved.role, label, fragment.text, fragment, fragment.rowLabel, resolved.viaModel));
  }
  let previousLine = "";
  for (const fragment of doc.read.fragments) {
    if (fragment.shape === "title") continue;
    const shipment = parseShipmentRow(fragment.text) ?? parseQtyBeforeUnit(fragment.text, previousLine);
    previousLine = fragment.text;
    if (shipment) {
      facts.push(makeFact(doc, kind, docNumber, "quantity", "Количество", shipment.quantity, fragment, shipment.item));
      facts.push(makeFact(doc, kind, docNumber, "line_total", "Сумма с НДС", shipment.gross, fragment, shipment.item));
    }
    const restated = parseRestatedPrice(fragment.text);
    if (restated) facts.push(makeFact(doc, kind, docNumber, "unit_price", "Цена без НДС", restated.price, fragment, restated.item));
    const deadline = parseRestatedDeadline(fragment.text);
    if (deadline) facts.push(makeFact(doc, kind, docNumber, "date", "Срок поставки", deadline, fragment));
    const months = fragment.text.match(/гаранти\w*[^.\n]{0,60}?(\d{1,3})\s+месяц/i);
    if (months?.[1]) facts.push(makeFact(doc, kind, docNumber, "quantity", "Гарантийный срок", `${months[1]} месяцев`, fragment));
    if ((doc.isReport ? false : kind === "contract") && !/допсоглашен/i.test(doc.name)) {
      const signed = doc.read.text.match(/(?:договор\w*[^.\n]{0,40}|от)\s+(\d{2}\.\d{2}\.\d{4})/i);
      if (signed?.[1] && !facts.some((item) => item.role === "date" && /дата\s+договор/i.test(item.label))) {
        facts.push(makeFact(doc, kind, docNumber, "date", "Дата договора", signed[1], fragment));
      }
    }
    const division = fragment.text.match(/цен[аы]\s+делени\w*[^.\n]{0,40}?(\d+[.,]\d+|\d+)\s*(мг|г|мм)?/i);
    if (division?.[1]) facts.push(makeFact(doc, kind, docNumber, "quantity", "Цена деления", `${division[1]} ${division[2] ?? ""}`.trim(), fragment));
    const country = fragment.text.match(/(страна(?:\s+\p{L}+){0,2})\s*[—–:-]\s*(\p{L}{3,40})/iu);
    if (country?.[1] && country[2]) facts.push(makeFact(doc, kind, docNumber, "text", country[1], country[2], fragment));
    const contractPrice = parseContractPrice(fragment.text);
    if (contractPrice) facts.push(makeFact(doc, kind, docNumber, "unit_price", "Цена договора", contractPrice, fragment));
    if (kind === "act" || /протокол|расч[её]т/i.test(doc.name)) {
      const stated = parseStatedTotal(fragment.text);
      const service = serviceName(doc.name, doc.read.text);
      if (stated && service) facts.push(makeFact(doc, kind, docNumber, "line_total", "Сумма с НДС", stated, fragment, service));
    }
  }
  const people = doc.read.fragments.filter((fragment) => fragment.shape === "table" && /участник|фио|слушател/i.test(fragment.columnHeader ?? "") && /[A-Za-zА-Яа-яЁё]{2,}/.test(fragment.text));
  const firstPerson = people[0];
  if (people.length >= 2 && firstPerson) facts.push(makeFact(doc, kind, docNumber, "quantity", "Число участников", `${people.length} чел.`, firstPerson));
  return inherit(facts, doc.read.text);
}

function serviceName(name: string, text: string): string | undefined {
  const blob = `${name} ${text.slice(0, 240)}`;
  const stem = blob.match(/перевоз\w*|монтаж\w*|обучен\w*|пусконалад\w*|сертификац\w*|заземл\w*/i)?.[0];
  return stem?.toLowerCase();
}

function noteModel(check: CheckResult, fact: Fact, sources: Fact[]): CheckResult {
  const labels = new Set<string>();
  if (fact.viaModel) labels.add(fact.label);
  for (const ref of check.evidenceReferences) {
    const source = sources.find((item) => item.documentId === ref.documentId && item.fragment.anchor === ref.locationInDocument);
    if (source?.viaModel) labels.add(source.label);
  }
  if (!labels.size) return check;
  const list = [...labels].map((label) => `«${label}»`).join(", ");
  return {
    ...check,
    explanation: `${check.explanation} Языковая модель определила смысл подписи ${list}; значения разобраны и сравнены кодом.`,
  };
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
  viaModel?: boolean,
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
  if (viaModel) fact.viaModel = true;
  if (fact.parsed.kind === "money") fact.basis = moneyBasis(`${label} ${fragment.unitHint ?? ""}`);
  const inlineDate = raw.match(/(\d{2}\.\d{2}\.\d{4})/);
  const dated = inlineDate?.[1] ? parseDate(inlineDate[1]) : documentDate(doc.read.text);
  if (!doc.isReport && dated) fact.operationDate = dated;
  return fact;
}

function inherit(facts: Fact[], text: string): Fact[] {
  const contract = facts.find((fact) => fact.role === "contract_number" && fact.parsed.kind === "id");
  const contractToken = contract && contract.parsed.kind === "id" ? contract.parsed.token : facts.find((fact) => fact.docKind === "contract")?.docNumber;
  const party = facts.find((fact) => fact.role === "counterparty")?.raw;
  const named = facts.filter((fact) => fact.role === "item_name");
  const singleNamed = named.length === 1 ? named[0] : undefined;
  const netSheets = new Set(facts.filter((fact) => /за вычетом возврата/i.test(fact.fragment.columnHeader ?? "")).map((fact) => fact.fragment.sheet));
  const cutoff = periodEnd(text);
  return facts.map((fact) => {
    const next: Fact = { ...fact };
    if (fact.role === "transport") {
      delete next.item;
    } else if (!next.item && singleNamed && (fact.role === "quantity" || fact.role === "line_total" || fact.role === "unit_price" || fact.role === "date")) {
      next.item = singleNamed.raw;
    }
    if (!next.contract && contractToken && fact.role !== "contract_number") next.contract = contractToken;
    if (!next.counterparty && party && fact.role !== "counterparty") next.counterparty = party;
    if (cutoff) next.cutoff = cutoff;
    if (next.fragment.sheet && netSheets.has(next.fragment.sheet) && next.item && (next.role === "quantity" || next.role === "line_total")) next.net = true;
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

function parseLine(text: string, hints: RoleHints): { role: Role; label: string; value: string; viaModel: boolean } | null {
  const colon = text.match(/^(.{2,80}?)(?:\s*[:—–]\s+|\s+-\s+)(.+)$/);
  if (colon?.[1] && colon[2]) {
    const resolved = resolveRole(colon[1], colon[2], hints);
    if (resolved) return { role: resolved.role, label: colon[1].trim(), value: colon[2].trim(), viaModel: resolved.viaModel };
    if (colon[2].trim().length <= 40 && /страна|город|модель|произв/i.test(colon[1])) {
      return { role: "text", label: colon[1].trim(), value: colon[2].trim(), viaModel: false };
    }
  }
  if (/договор/i.test(text)) {
    const token = parseContractToken(text);
    if (token && /[-/]/.test(token)) return { role: "contract_number", label: "Номер договора", value: token, viaModel: false };
  }
  const inn = text.match(/инн\s*[:№]?\s*(\d{10}|\d{12})/i);
  if (inn?.[1]) return { role: "inn", label: "ИНН", value: inn[1], viaModel: false };
  return null;
}

function partySide(text: string): "supplier" | "buyer" | "any" {
  if (/поставщик|исполнител|продавец/i.test(text)) return "supplier";
  if (/заказчик|покупател|плательщик/i.test(text)) return "buyer";
  return "any";
}

function isService(fact: Fact): boolean {
  return /перевоз|монтаж|обучен|пусконалад|сертификац|заземл/i.test(`${fact.item ?? ""} ${fact.label}`);
}

function isTotalRow(fact: Fact): boolean {
  return /^(итого|всего)\b/i.test(`${fact.item ?? ""} ${fact.fragment.rowLabel ?? ""} ${fact.fragment.text}`);
}

function orgTokens(name: string): string[] {
  return normText(name).split(" ").filter((word) => word.length > 4 && !/обществ|компани|ограничен/.test(word));
}

function innBeside(text: string, inn: string, token: string): boolean {
  const hay = normText(text);
  const orgAt = hay.indexOf(normText(token));
  const innAt = hay.indexOf(inn);
  if (orgAt < 0 || innAt < 0) return false;
  const between = hay.slice(Math.min(orgAt, innAt), Math.max(orgAt, innAt));
  return !/\d{10}|\d{12}/.test(between);
}

function mentionsItem(item: string, source: Fact): boolean {
  if (source.item && sameItem(item, source.item)) return true;
  const blob = `${source.fragment.text} ${source.fragment.rowLabel ?? ""} ${source.docName} ${source.item ?? ""}`;
  const codes = productCodes(item);
  if (codes.length && codes.some((code) => blob.toUpperCase().includes(code))) return true;
  const number = item.match(/\d{3,}/)?.[0];
  if (number && new RegExp(`(^|\\D)${number}(\\D|$)`).test(blob)) return true;
  const specific = ["заземл", "сертификац", "пусконалад", "перевоз", "обучен", "монтаж"];
  const wanted = specific.find((stem) => normText(item).includes(stem));
  return Boolean(wanted && normText(`${source.item ?? ""} ${source.docName}`).includes(wanted));
}

function isReturnDoc(fact: Fact): boolean {
  return /возврат/i.test(fact.docName) || /^\s*акт возврата/i.test(fact.docText.slice(0, 180));
}

function quantityFocus(label: string): "stock" | "received" | "contract" | "hours" | "any" {
  if (/оприходован/i.test(label)) return "stock";
  if (/за вычетом возврата|принят|получен/i.test(label)) return "received";
  if (/по договору/i.test(label)) return "contract";
  if (/час|продолжительн|^объем$|^объём$/i.test(label)) return "hours";
  return "any";
}

function inPeriod(fact: Fact, source: Fact): boolean {
  if (!fact.cutoff || !source.operationDate) return true;
  const marker = `${fact.label} ${fact.fragment.rowLabel ?? ""}`;
  if (/№\s*\d+/.test(marker) || /^\d{3,}$/.test(fact.fragment.rowLabel ?? "")) return true;
  return source.operationDate <= fact.cutoff;
}

function scaleToUnit(minor: bigint, from: string, to: string, item: string, factors: Map<string, number>): bigint | null {
  if (sameUnit(from, to)) return minor;
  const pieces = productCodes(item).map((code) => factors.get(code)).find((value) => value != null) ?? (/набор|комплект/i.test(item) ? factors.get("*") : undefined);
  if (!pieces || pieces < 2) return null;
  const kit = (unit: string) => /компл|набор/i.test(unit);
  if (!kit(from) && kit(to)) {
    if (minor % (BigInt(pieces) * 10000n) !== 0n && minor % BigInt(pieces) !== 0n) return null;
    return minor / BigInt(pieces);
  }
  if (kit(from) && !kit(to)) return minor * BigInt(pieces);
  return null;
}

function assess(fact: Fact, found: Fact[], sources: Fact[], docs: { id: string; name: string; text: string; fragment: Fragment }[]): {
  sourceValue: string | null;
  discrepancy: string | null;
  status: CheckStatus;
  severity: Severity;
  explanation: string;
  evidenceReferences: EvidenceReference[];
  unit?: string;
} | null {
  if (/подпис/i.test(fact.label) && /имеет|есть|^да$/i.test(fact.raw.trim())) {
    const number = fact.label.match(/№\s*([0-9A-Za-zА-Яа-я-]+)/)?.[1];
    const docs = sources.filter((source) => (number ? source.docName.includes(number) || source.docText.includes(number) : false));
    if (docs.some((source) => blankSignature(source.docText))) {
      return {
        sourceValue: "поле подписи пустое",
        discrepancy: null,
        status: "needs_review",
        severity: "medium",
        explanation: `В отчёте для «${fact.label}» указано «${fact.raw}», но в документе строка подписи не заполнена (оставлено место для подписи). Это не подтверждает и не опровергает подлинность.`,
        evidenceReferences: docs.slice(0, 2).map((source) => reference(source.documentId, source.fragment, source.fragment.text.slice(0, 180))),
      };
    }
  }
  if (/отнес/i.test(fact.label) && fact.parsed.kind === "id") {
    const number = `${fact.fragment.rowLabel ?? ""} ${fact.item ?? ""}`.match(/(?:№\s*)?(\d{3,})\b/)?.[1] ?? "";
    const payment = docs.find((doc) => number && /плат|поручен/i.test(doc.name) && new RegExp(`(^|\\D)${number}(\\D|$)`).test(doc.name));
    if (payment && !contractMentioned(payment.text, fact.parsed.token)) {
      return {
        sourceValue: "назначение не содержит номера договора",
        discrepancy: null,
        status: "needs_review",
        severity: "medium",
        explanation: `Сумма платежа № ${number} есть в комплекте, но его назначение не содержит договор ${fact.parsed.token}. Отнести платеж к этому договору по одному только отчету нельзя.`,
        evidenceReferences: [reference(payment.id, payment.fragment, payment.text.slice(0, 180))],
      };
    }
  }
  if (/^(да|завершен|завершён|выполнено)$/i.test(fact.raw.trim()) && /выполнен|сертификац|ввод/i.test(fact.label)) {
    const proving = sources.filter((source) => confirms(fact, source) && source.docKind !== "invoice" && !/письм|счет|счёт/i.test(source.docName));
    const serial = fact.label.match(/[A-ZА-ЯЁ]{1,6}\d{0,4}-\d{3,}/i)?.[0];
    const serialSeen = serial ? proving.some((source) => source.docText.includes(serial)) : proving.length > 0;
    if (!serialSeen) {
      const words = normText(fact.label).split(" ").filter((word) => word.length > 5);
      const letterOnly = sources.some((source) => /письм/i.test(source.docName) && (serial ? source.docText.includes(serial) : words.some((word) => normText(`${source.docName} ${source.docText.slice(0, 500)}`).includes(word))));
      if (letterOnly) {
        return {
          sourceValue: serial ? `нужен протокол для ${serial}` : "переписка не заменяет акт",
          discrepancy: null,
          status: "needs_review",
          severity: "medium",
          explanation: `«${fact.label}» отмечено как завершенное, но подтверждающий протокол или акт с этим идентификатором не найден. Письмо о готовности не заменяет итоговый документ.`,
          evidenceReferences: [],
        };
      }
      return {
        sourceValue: null,
        discrepancy: null,
        status: "not_found",
        severity: "high",
        explanation: `Для «${fact.label}» в комплекте нет акта или протокола. Счет или переписка сами по себе не подтверждают выполнение.`,
        evidenceReferences: [],
      };
    }
  }

  const focused = quantityFocus(fact.label);
  let pool = found.filter((source) => inPeriod(fact, source));
  if (focused === "stock") {
    pool = pool.filter((source) => /склад|остат/i.test(`${source.docName} ${source.fragment.sheet ?? ""}`));
    const affinity = /оприходован|приход|поступил/i.test(fact.label) ? /приход|поступ|оприход/i : /остат/i.test(fact.label) ? /остат/i : /возврат/i.test(fact.label) ? /возврат/i : null;
    if (affinity) {
      const narrowed = pool.filter((source) => affinity.test(`${source.fragment.columnHeader ?? ""} ${source.label}`));
      if (narrowed.length) pool = narrowed;
    }
  }
  if (focused === "received") {
    const deliveries = pool.filter((source) => source.docKind === "waybill" || source.docKind === "act" || isReturnDoc(source));
    const detailed = deliveries.filter((source) => !/реестр/i.test(source.docName));
    pool = detailed.length ? detailed : deliveries;
  }
  if (focused === "contract") pool = pool.filter((source) => source.docKind === "contract");
  if (focused === "hours") {
    const journal = pool.filter((source) => /журнал/i.test(`${source.docName} ${source.fragment.sheet ?? ""}`));
    if (journal.length) pool = journal;
  }
  if (/выполнен/i.test(fact.label)) pool = pool.filter((source) => source.docKind !== "invoice" && !/письм|счет|счёт/i.test(source.docName));
  if (fact.role === "unit_price" && /договор/i.test(fact.label) && !fact.item) {
    const stated = pool.filter((source) => /цена\s+договора/i.test(source.label));
    if (stated.length) pool = stated;
  }
  if (fact.role === "unit_price") {
    const amended = pool.filter((source) => /допсоглашен/i.test(source.docName));
    const contractual = pool.filter((source) => source.docKind === "contract" || /спецификац|договор|допсоглашен/i.test(source.docName));
    if (amended.length) pool = amended;
    else if (contractual.length) pool = contractual;
  }
  if (fact.role === "date" && /срок/i.test(fact.label)) {
    const amended = pool.filter((source) => /допсоглашен/i.test(source.docName));
    if (amended.length) pool = amended;
  }
  if (fact.role === "line_total" && isService(fact)) {
    const journal = pool.filter((source) => /журнал/i.test(source.docName));
    const performed = pool.filter((source) => source.docKind === "act" || source.docKind === "waybill");
    const calculated = pool.filter((source) => /расч[её]т/i.test(source.docName));
    if (journal.length) pool = journal;
    else if (performed.length) pool = performed;
    else if (calculated.length) pool = calculated;
    else pool = pool.filter((source) => source.docKind !== "invoice" && source.docKind !== "contract");
  } else if (fact.role === "line_total" && /с\s*ндс|принят|получ/i.test(`${fact.label} ${fact.fragment.columnHeader ?? ""}`)) {
    const shipped = pool.filter((source) => source.docKind === "waybill" || source.docKind === "act" || isReturnDoc(source));
    if (shipped.length) pool = shipped;
  }
  pool = pool.filter((source) => !isTotalRow(source));
  if (!pool.length || (fact.role !== "quantity" && fact.role !== "line_total" && fact.role !== "unit_price" && fact.role !== "date")) return null;
  if (!fact.item && focused === "any" && fact.role === "quantity") return null;

  const factors = kitFactors(pool.map((source) => source.docText));
  if (fact.parsed.kind === "quantity" && focused === "any") {
    const values = new Map<string, Fact>();
    for (const source of pool) if (source.parsed.kind === "quantity" && sameUnit(source.parsed.unit, fact.parsed.unit)) values.set(source.parsed.minor.toString(), source);
    if (values.size !== 1) return null;
    const only = [...values.values()][0];
    if (!only || only.parsed.kind !== "quantity") return null;
    const same = only.parsed.minor === fact.parsed.minor;
    return {
      sourceValue: only.raw,
      discrepancy: same ? null : formatSigned(fact.parsed.minor - only.parsed.minor, fact.parsed.unit),
      status: same ? "match" : "mismatch",
      severity: same ? "low" : "medium",
      explanation: `В отчёте ${fact.raw}, в «${only.docName}» — ${only.raw}.`,
      evidenceReferences: [[...values.values()][0]].filter((item): item is Fact => item != null).map((source) => reference(source.documentId, source.fragment, source.raw)),
      unit: fact.parsed.unit,
    };
  }
  if (fact.parsed.kind === "quantity") {
    let total = 0n;
    const parts: Fact[] = [];
    for (const source of pool) {
      if (source.parsed.kind !== "quantity") continue;
      if (!fact.net && isReturnDoc(source)) continue;
      const scaled = scaleToUnit(source.parsed.minor, source.parsed.unit, fact.parsed.unit, `${fact.item ?? ""} ${source.item ?? ""}`, factors);
      if (scaled == null) continue;
      total += scaled * (isReturnDoc(source) ? -1n : 1n);
      parts.push(source);
    }
    const unique = new Map<string, Fact>();
    for (const part of parts) {
      const code = productCodes(`${part.item ?? ""}`).join(",") || normText(part.item ?? "");
      const minor = part.parsed.kind === "quantity" ? part.parsed.minor.toString() : "";
      unique.set(`${part.documentId}|${part.fragment.anchor}|${code}|${minor}`, part);
    }
    const kept = [...unique.values()];
    total = 0n;
    for (const part of kept) {
      if (part.parsed.kind !== "quantity") continue;
      const scaled = scaleToUnit(part.parsed.minor, part.parsed.unit, fact.parsed.unit, `${fact.item ?? ""} ${part.item ?? ""}`, factors);
      if (scaled == null) continue;
      total += scaled * (isReturnDoc(part) ? -1n : 1n);
    }
    if (!kept.length) return null;
    const same = total === fact.parsed.minor;
    return {
      sourceValue: formatScaled(total, fact.parsed.unit),
      discrepancy: same ? null : formatSigned(fact.parsed.minor - total, fact.parsed.unit),
      status: same ? "match" : "mismatch",
      severity: same ? "low" : "high",
      explanation: kept.length > 1
        ? `Количество собрано по документам одной операции${fact.net ? " за вычетом возврата" : ""}: ${kept.map((part) => `${part.raw} (${part.docName})`).join(", ")}. Итого ${formatScaled(total, fact.parsed.unit)}.`
        : `В отчёте ${fact.raw}, в «${kept[0]?.docName}» — ${kept[0]?.raw}.`,
      evidenceReferences: kept.map((part) => reference(part.documentId, part.fragment, part.raw)),
      unit: fact.parsed.unit,
    };
  }
  if (fact.parsed.kind === "money" && (fact.role === "line_total" || fact.role === "unit_price")) {
    if (fact.basis === "gross" || fact.basis === "net") {
      const sameBasis = pool.filter((source) => source.basis === fact.basis);
      if (sameBasis.length) pool = sameBasis;
    }
    let total = 0n;
    const parts: Fact[] = [];
    for (const source of pool) {
      if (source.parsed.kind !== "money" || source.basis === "tax") continue;
      if (!fact.net && isReturnDoc(source)) continue;
      const converted = convertMoney(source.parsed.minor, source.basis ?? "unknown", fact.basis ?? "unknown");
      if (converted == null) continue;
      total += converted * (fact.net && isReturnDoc(source) ? -1n : 1n);
      parts.push(source);
    }
    if (!parts.length) return null;
    if (fact.role === "unit_price" && parts.length > 1) total = parts[0] && parts[0].parsed.kind === "money" ? convertMoney(parts[0].parsed.minor, parts[0].basis ?? "unknown", fact.basis ?? "unknown") ?? total : total;
    const same = total === fact.parsed.minor;
    return {
      sourceValue: formatScaled(total, "₽"),
      discrepancy: same ? null : formatSigned(fact.parsed.minor - total, "₽"),
      status: same ? "match" : "mismatch",
      severity: same ? "low" : "high",
      explanation: `Сумма приведена к той же базе НДС, что и в отчёте${fact.net ? ", за вычетом возврата" : ""}. Итого ${formatScaled(total, "₽")}.`,
      evidenceReferences: parts.map((part) => reference(part.documentId, part.fragment, part.raw)),
      unit: "₽",
    };
  }
  if (fact.role === "date" && pool.length) {
    const dates = pool.filter((source) => source.parsed.kind === "date");
    const unique = [...new Set(dates.map((source) => (source.parsed.kind === "date" ? source.parsed.iso : "")))];
    if (unique.length > 1) return null;
    const primary = dates[0];
    if (!primary || primary.parsed.kind !== "date" || fact.parsed.kind !== "date") return null;
    const same = primary.parsed.iso === fact.parsed.iso;
    return {
      sourceValue: primary.raw,
      discrepancy: null,
      status: same ? "match" : "mismatch",
      severity: same ? "low" : "medium",
      explanation: `В отчёте ${fact.raw}, в «${primary.docName}» — ${primary.raw}.`,
      evidenceReferences: dates.map((source) => reference(source.documentId, source.fragment, source.raw)),
    };
  }
  return null;
}

function toCheck(fact: Fact, sources: Fact[], reportFacts: Fact[], docs: { id: string; name: string; text: string; fragment: Fragment }[], index: number, unreadable: FileProblem[], partial: PreparedDoc[]): CheckResult {
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
  let found = sources.filter((source) => confirms(fact, source));
  if (fact.role === "inn") {
    const side = partySide(fact.label);
    const named = reportFacts.find((item) => item.role === "counterparty" && item.parsed.kind === "text" && partySide(item.label) === side);
    const tokens = named ? orgTokens(named.raw) : [];
    if (tokens.length) {
      const owned = found.filter((source) => tokens.some((token) => innBeside(source.docText, source.raw, token)));
      if (owned.length) found = owned;
    }
  }
  const assessed = assess(fact, found, sources, docs);
  if (assessed) return finish(base, assessed);
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
    explanation: `В отчёте ${fact.raw}, в «${primary.docName}» — ${primary.raw.replace(/\.$/, "")}${delta ? `. Разница ${delta} (отчёт минус первичный документ)` : ""}. Уточните «${fact.label}» и при необходимости запросите исправленный документ.`,
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
  if (report.role === "contract_number" && report.parsed.kind === "id" && source.parsed.kind === "id" && !sameToken(report.parsed.token, source.parsed.token) && source.docKind !== "contract") return false;
  if ((report.role === "counterparty" || report.role === "inn") && /ооо|ао|пао|зао|ип\b/i.test(report.raw) && !/ооо|ао|пао|зао|ип\b/i.test(source.raw) && source.role === "counterparty") return false;
  if ((report.role === "line_total" || report.role === "unit_price") && source.docKind === "contract" && !source.item && !/договор/i.test(report.label)) return false;
  if (report.role === "text" && !similarText(report.label, source.label)) return false;
  if ((report.role === "inn" || report.role === "counterparty") && partySide(report.label) !== "any") {
    const got = partySide(`${source.label} ${source.fragment.text}`);
    if (got === "any" && !/договор/i.test(source.docName)) return false;
    if (got !== "any" && got !== partySide(report.label)) return false;
  }
  if (report.role === "date" && /дата\s+договор/i.test(report.label)) {
    if (/срок/i.test(source.label) || source.docKind !== "contract" || /допсоглашен/i.test(source.docName)) return false;
  }
  if (needsItem(report.role) && report.item && !mentionsItem(report.item, source)) return false;
  if (!report.item && (report.role === "quantity" || report.role === "unit_price")) {
    const words = normText(report.label).split(" ").filter((word) => word.length > 5 && !/договор|поставк|оборудован|количеств|стоимост|учетом|изменен/.test(word));
    const blob = normText(`${source.label} ${source.item ?? ""} ${source.fragment.text}`);
    if (words.length && !words.some((word) => blob.includes(word)) && !similarText(report.label, source.label)) return false;
  }
  if (report.role === "quantity" && report.parsed.kind === "quantity" && source.parsed.kind === "quantity") {
    if (!sameUnit(report.parsed.unit, source.parsed.unit) && scaleToUnit(source.parsed.minor, source.parsed.unit, report.parsed.unit, `${report.item ?? ""} ${source.item ?? ""}`, kitFactors([source.docText, report.docText])) == null) return false;
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
  if (/допсоглашен|договор|спецификац/.test(filename)) return "contract";
  if (/плат/.test(filename)) return "payment";
  if (/реестр|склад|журнал|расчет|расчёт/.test(filename)) return "other";
  const head = text.slice(0, 120).toLowerCase();
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
