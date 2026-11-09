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
  clipParty,
  parseContractPrice,
  parseBareShipment,
  parseIndicatorLine,
  parseIndicatorRows,
  parseQtyBeforeUnit,
  parseShipmentRow,
  statedTolerance,
  parseStatedTotal,
  periodEnd,
  sameItem,
} from "./measure";
import {
  detectRole,
  isDateUnit,
  isMoneyUnit,
  isQuantityUnit,
  fingerprint,
  formatScaled,
  formatSigned,
  isTransportText,
  normText,
  normalizeToken,
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
  if (unitHint && isDateUnit(unitHint) && parseDate(raw)) return { role: "date", viaModel: false };
  if (unitHint && isQuantityUnit(unitHint) && parseQuantity(raw, unitHint)) return { role: "quantity", viaModel: false };
  if (unitHint && isMoneyUnit(unitHint) && parseMoney(raw) != null) return { role: /цена|price|tarif|rate|preis|prix|precio|prezzo|preço|preco|cena|prijs|fiyat|单价/i.test(label) ? "unit_price" : "line_total", viaModel: false };
  return null;
}

function resolveRole(label: string, raw: string, hints: RoleHints, unitHint?: string): { role: Role; viaModel: boolean } | null {
  if ((/дата|срок|date|datum|fecha|tarih|日期|deadline|frist|d[eé]lai|scadenza|plazo|termin|süre|sure|期限|period/i.test(label)) && parseDate(raw)) return { role: "date", viaModel: false };
  const measured = roleFromUnit(label, raw, unitHint);
  if (measured && unitHint && !isMoneyUnit(unitHint)) return measured;
  const known = detectRole(label);
  if (known && !(known === "item_name" && isStatusValue(raw))) {
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
  const hasKv = doc.read.fragments.some((fragment) => fragment.shape === "kv");
  let indicatorTable = false;
  let vertical: "seek" | "table" | "label" | "value" | "unit" = "seek";
  let verticalLabel = "";
  let verticalValue = "";
  const pushVertical = (unit: string) => {
    const role = indicatorRole(verticalLabel, unit);
    const raw = unit ? `${verticalValue} ${unit}` : verticalValue;
    const fragment = doc.read.fragments.find((item) => item.text.trim() === verticalValue) ?? doc.read.fragments[0];
    if (fragment) facts.push(makeFact(doc, kind, docNumber, role, verticalLabel, raw, { ...fragment, unitHint: unit || fragment.unitHint, label: verticalLabel }));
  };
  for (const fragment of doc.read.fragments) {
    const label = (fragment.label || fragment.columnHeader || "").trim();
    if (!hasKv) {
      const line = fragment.text.trim();
      if (/^(показател\p{L}*|значен\p{L}*)$/iu.test(line)) {
        vertical = "table";
        continue;
      }
      if (vertical !== "seek" && /^(№|ед\.?)$/i.test(line)) continue;
      if (vertical === "unit") {
        if (isVerticalUnit(line)) {
          pushVertical(line);
          vertical = "table";
          continue;
        }
        pushVertical("");
        vertical = "table";
      }
      if (vertical === "table" && /^\d{1,2}$/.test(line)) {
        vertical = "label";
        continue;
      }
      if (vertical === "label") {
        verticalLabel = line;
        vertical = "value";
        continue;
      }
      if (vertical === "value") {
        verticalValue = line;
        vertical = "unit";
        continue;
      }
    }
    if (fragment.shape === "title") continue;
    if (fragment.shape === "line") {
      if (/показател\w*\s+значен/i.test(fragment.text)) indicatorTable = true;
      else if (indicatorTable) {
        const row = parseIndicatorLine(fragment.text);
        if (row) {
          const role = indicatorRole(row.label, row.unit);
          const raw = row.unit ? `${row.value} ${row.unit}` : row.value;
          facts.push(makeFact(doc, kind, docNumber, role, row.label, raw, { ...fragment, unitHint: row.unit || fragment.unitHint, label: row.label }));
        } else indicatorTable = false;
      }
      for (const parsedLine of parseStatements(fragment.text, hints)) {
        facts.push(makeFact(doc, kind, docNumber, parsedLine.role, parsedLine.label, parsedLine.value, fragment, undefined, parsedLine.viaModel));
      }
      for (const row of parseIndicatorRows(fragment.text)) {
        const role = indicatorRole(row.label, row.unit);
        const raw = row.unit ? `${row.value} ${row.unit}` : row.value;
        facts.push(makeFact(doc, kind, docNumber, role, row.label, raw, { ...fragment, unitHint: row.unit || fragment.unitHint, label: row.label }));
      }
      continue;
    }
    indicatorTable = false;
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
  let headerLine = "";
  for (const fragment of doc.read.fragments) {
    if (fragment.shape === "title") continue;
    if (/количество|наименован|кол-?во|цена|сумм/i.test(fragment.text)) headerLine = fragment.text;
    const shipment = parseShipmentRow(fragment.text) ?? parseQtyBeforeUnit(fragment.text, previousLine) ?? parseBareShipment(fragment.text, headerLine);
    previousLine = fragment.text;
    if (shipment) {
      facts.push(makeFact(doc, kind, docNumber, "quantity", "Количество", shipment.quantity, fragment, shipment.item));
      facts.push(makeFact(doc, kind, docNumber, "line_total", "Сумма", shipment.gross, fragment, shipment.item));
      const price = shipment.gross && shipment.quantity ? unitPriceOf(shipment) : null;
      if (price) facts.push(makeFact(doc, kind, docNumber, "unit_price", "Цена за единицу", price, fragment, shipment.item));
    }
    for (const handed of fragment.text.matchAll(/(?:^|[^\p{L}])(передано|принято|отгружено|получено)\s+(\d[\d\s\u00A0]*(?:[.,]\d+)?)\s*(кг|г|км|метров\w*|метра|метр|м|шт\.?|час\w*|минут\w*)/giu)) {
      const qty = handed[2];
      const unit = handed[3];
      if (qty && unit) facts.push(makeFact(doc, kind, docNumber, "quantity", "Количество", `${qty} ${unit}`, fragment, handedItem(fragment.text, handed.index ?? 0)));
    }
    const minutes = fragment.text.match(/(\d+(?:[.,]\d+)?)\s*минут/i);
    if (minutes?.[1]) facts.push(makeFact(doc, kind, docNumber, "quantity", "Продолжительность", `${minutes[1]} мин`, fragment));
    const accepted = !doc.isReport && fragment.text.match(/(?:принят\w*|передан\w*|отгружен\w*|получен\w*|накладн\w*[^.\n]{0,40}?от)[^.\n]{0,40}?(\d{2}\.\d{2}\.\d{4})/i);
    if (accepted?.[1]) facts.push(makeFact(doc, kind, docNumber, "date", "Дата приёмки", accepted[1], fragment));
    const restated = parseRestatedPrice(fragment.text);
    if (restated) facts.push(makeFact(doc, kind, docNumber, "unit_price", "Цена без НДС", restated.price, fragment, restated.item));
    const deadline = parseRestatedDeadline(fragment.text);
    if (deadline) facts.push(makeFact(doc, kind, docNumber, "date", "Срок поставки", deadline, fragment));
    const months = fragment.text.match(/(?:гаранти\w*|warrant\w*|garantie|garant[ií]a|garanzia|gwaranc\w*|保修)[^.\n]{0,80}?(\d{1,3})\s*(?:месяц\w*|months?|monate?|mois|mesi|meses|miesi\w*|maanden|ay)/i);
    if (months?.[1]) facts.push(makeFact(doc, kind, docNumber, "quantity", "Гарантийный срок", `${months[1]} месяцев`, fragment));
    if ((doc.isReport ? false : kind === "contract") && !isAmendmentDoc(doc.name, doc.read.text)) {
      const signed = doc.read.text.match(/(?:(?<![\p{L}])договор(?!н)\w*|(?<![\p{L}])от(?![\p{L}])|dated|vom|d\.d\.|(?<![\p{L}])du(?![\p{L}])|(?<![\p{L}])del(?![\p{L}])|z\s+dnia)[^.\n]{0,40}?\s+(\d{2}\.\d{2}\.\d{4}|\d{1,2}\s+\p{L}+\s+\d{4})/iu);
      if (signed?.[1] && !facts.some((item) => item.role === "date" && /дата\s+договор/i.test(item.label))) {
        facts.push(makeFact(doc, kind, docNumber, "date", "Дата договора", signed[1], fragment));
      }
    }
    const division = fragment.text.match(/(?:цен[аы]\s+делени\w*|division(?:\s+value)?|scale\s+division|teilung|divisione|división|działk\w*|dzialk\w*|schaalverdeling|taksimat|分度)[^.\n]{0,50}?(\d+[.,]\d+|\d+)\s*(мг|mg|г|g|мм|mm)?/i);
    if (division?.[1]) facts.push(makeFact(doc, kind, docNumber, "quantity", "Цена деления", `${division[1]} ${division[2] ?? ""}`.trim(), fragment));
    const country = fragment.text.match(/(страна(?:\s+\p{L}+){0,2}|country(?:\s+of(?:\s+\p{L}+){0,2})?|pays|paese|pa[ií]s|kraj|ülke|ulke|国家)\s*[—–:-]\s*(\p{L}{3,40})/iu);
    if (country?.[1] && country[2]) facts.push(makeFact(doc, kind, docNumber, "text", country[1], country[2], fragment));
    const contractPrice = parseContractPrice(fragment.text);
    if (contractPrice) facts.push(makeFact(doc, kind, docNumber, "unit_price", "Цена договора", contractPrice, fragment));
    if (kind === "act" || /протокол|расч[её]т/i.test(doc.name)) {
      const stated = parseStatedTotal(fragment.text);
      const service = serviceName(doc.name, doc.read.text);
      if (stated && service) facts.push(makeFact(doc, kind, docNumber, "line_total", "Сумма с НДС", stated, fragment, service));
    }
  }
    if (vertical === "unit") pushVertical("");
    const people = doc.read.fragments.filter((fragment) => fragment.shape === "table" && /участник|фио|слушател|participant|attendee|teilnehmer|partecipant|uczestnik|deelnemer|katılımcı|katilimci|姓名/i.test(fragment.columnHeader ?? "") && /\p{L}{2,}/u.test(fragment.text));
  const firstPerson = people[0];
  if (people.length >= 2 && firstPerson) facts.push(makeFact(doc, kind, docNumber, "quantity", "Число участников", `${people.length} чел.`, firstPerson));
  return inherit(facts, doc.read.text, doc.read.fragments);
}

function isVerticalUnit(line: string): boolean {
  return /^(шт\.?|₽|руб\.?|ч|час\w*|акад\.?\s*ч\.?|мес\.?|чел\.?|г|кг|км|м|мин\.?)$/i.test(line.trim());
}

function handedItem(text: string, index: number): string | undefined {
  const before = text.slice(Math.max(0, index - 80), index).replace(/^.*(?:\.|:)\s*/, "").trim();
  const item = before.replace(/^(?:товар|номенклатура|наименование)\s*/i, "").trim();
  return item.length >= 3 ? item : undefined;
}

function indicatorRole(label: string, unit: string): Role {
  const known = detectRole(label);
  if ((known === "contract_number" || known === "date") && /₽|руб/i.test(unit)) return /цена|тариф/i.test(label) ? "unit_price" : "line_total";
  if (known === "contract_number" || known === "counterparty" || known === "date" || known === "inn" || known === "transport" || known === "unit_price" || known === "quantity" || known === "line_total") return known;
  if (/₽|руб/i.test(unit)) return /цена|тариф/i.test(label) ? "unit_price" : "line_total";
  return "quantity";
}

function unitPriceOf(row: { quantity: string; gross: string }): string | null {
  const qty = parseQuantity(row.quantity);
  const gross = parseMoney(row.gross);
  if (!qty || gross == null || qty.minor <= 0n) return null;
  const price = (gross * 10000n) / qty.minor;
  return formatScaled(price, "₽");
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

function sameRow(left: Fragment, right: Fragment): boolean {
  const row = left.anchor.match(/r(\d+)/)?.[1];
  return Boolean(row && left.sheet === right.sheet && right.anchor.includes(`r${row}c`));
}

function rowContract(fact: Fact, fragments: Fragment[]): string | undefined {
  const sibling = fragments.find((item) => sameRow(fact.fragment, item) && item.columnHeader && /договор|contract/i.test(item.columnHeader));
  return sibling ? parseContractToken(sibling.text) ?? undefined : undefined;
}

function sumDistinctQuantities(list: Fact[]): bigint {
  const seen = new Set<string>();
  let total = 0n;
  for (const source of list) {
    if (source.parsed.kind !== "quantity") continue;
    const key = `${source.documentId}|${source.parsed.minor.toString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += source.parsed.minor;
  }
  return total;
}

function rowOperationDate(fact: Fact, fragments: Fragment[]): string | null {
  const sibling = fragments.find((item) => sameRow(fact.fragment, item) && parseDate(item.text));
  return sibling ? parseDate(sibling.text) : null;
}

function inherit(facts: Fact[], text: string, fragments: Fragment[]): Fact[] {
  const contract = facts.find((fact) => fact.role === "contract_number" && fact.parsed.kind === "id");
  const contractToken = contract && contract.parsed.kind === "id" ? contract.parsed.token : facts.find((fact) => fact.docKind === "contract")?.docNumber;
  const party = facts.find((fact) => fact.role === "counterparty")?.raw;
  const named = facts.filter((fact) => fact.role === "item_name");
  const singleNamed = named.length === 1 ? named[0] : undefined;
  const netSheets = new Set(facts.filter((fact) => /за вычетом возврата|less returns|abzüglich|abzuglich|d[eé]duction|deducci[oó]n|al netto|pomniejsz|aftrek van retour|iade|扣除退/i.test(fact.fragment.columnHeader ?? "")).map((fact) => fact.fragment.sheet));
  const cutoff = periodEnd(text);
  return facts.map((fact) => {
    const next: Fact = { ...fact };
    const onRow = rowContract(fact, fragments);
    if (onRow) next.contract = onRow;
    const onDate = rowOperationDate(fact, fragments);
    if (onDate) next.operationDate = onDate;
    else if (/реестр|журнал|выписк/i.test(fact.docName) && !/\d{2}\.\d{2}\.\d{4}/.test(fact.fragment.text)) delete next.operationDate;
    if (fact.role === "transport") {
      delete next.item;
    } else if (!next.item && singleNamed && !isStatusValue(singleNamed.raw) && (fact.role === "quantity" || fact.role === "line_total" || fact.role === "unit_price" || fact.role === "date")) {
      next.item = singleNamed.raw;
    }
    if (!next.contract && contractToken && fact.role !== "contract_number") next.contract = contractToken;
    if (!next.counterparty && party && fact.role !== "counterparty") next.counterparty = party;
    if (cutoff) next.cutoff = cutoff;
    const labeledContract = parseContractToken(fact.label);
    if (labeledContract && /[-/]/.test(labeledContract)) next.contract = labeledContract;
    if (/за вычетом возврата|less returns|abzüglich|abzuglich|d[eé]duction|menos devol|al netto|pomniejsz|aftrek van retour|iade|扣除退/i.test(fact.label) || (fact.role === "line_total" && /принят/i.test(fact.label))) next.net = true;
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

function parseStatements(text: string, hints: RoleHints): { role: Role; label: string; value: string; viaModel: boolean }[] {
  const parts = text.split(/(?<=\.)\s+/).map((part) => part.trim()).filter(Boolean);
  const sentences = parts.length > 1 ? parts : [text];
  const found: { role: Role; label: string; value: string; viaModel: boolean }[] = [];
  for (const sentence of sentences) {
    const parsed = parseLine(sentence, hints);
    if (parsed) found.push(parsed);
  }
  return found;
}

function parseLine(text: string, hints: RoleHints): { role: Role; label: string; value: string; viaModel: boolean } | null {
  const colon = text.match(/^(.{2,80}?)(?:\s*[:—–]\s+|\s+-\s+)(.+)$/);
  if (colon?.[1] && colon[2]) {
    const resolved = resolveRole(colon[1], colon[2], hints);
    if (resolved) {
      const value = resolved.role === "counterparty" ? clipParty(colon[2].trim()) : colon[2].trim();
      const measured = parseQuantity(value);
      const handed = /передано|принято|отгружено|получено/i.test(colon[1]) && measured != null;
      if (value) return { role: handed && resolved.role === "line_total" ? "quantity" : resolved.role, label: colon[1].trim(), value, viaModel: resolved.viaModel };
    }
    if (colon[2].trim().length <= 40 && /страна|город|модель|произв/i.test(colon[1])) {
      return { role: "text", label: colon[1].trim(), value: colon[2].trim(), viaModel: false };
    }
  }
  if (/договор|contract|vertrag|contrat|contratto|contrato|umowa|overeenkomst|sözleşme|sozlesme|合同/i.test(text)) {
    const token = parseContractToken(text);
    if (token && /[-/]/.test(token)) return { role: "contract_number", label: "Номер договора", value: token, viaModel: false };
  }
  const inn = text.match(/инн\s*[:№]?\s*(\d{10}|\d{12})/i);
  if (inn?.[1]) return { role: "inn", label: "ИНН", value: inn[1], viaModel: false };
  return null;
}

function isStatusValue(raw: string): boolean {
  return /^(да|нет|yes|no|ja|nein|oui|non|s[iì]|sim|n[aã]o|tak|nie|evet|hay[ıi]r|是|否|завершен\w*|завершён\w*|выполнено|completed|done)$/i.test(raw.trim());
}

function isAmendmentDoc(name: string, text: string): boolean {
  if (/допсоглашен|dopsoglash|amendment|addendum|avenant|nachtrag/i.test(name)) return true;
  return /^[\s\S]{0,80}дополнительн\w*\s+соглашен/i.test(text);
}

function dateKind(label: string): "deadline" | "delivery" | "payment" | "signed" | "any" {
  if (/срок|deadline|lieferfrist|d[eé]lai|delai|consegna|plazo|dostaw|leverterm|teslim|交货期/i.test(label)) return "deadline";
  if (/фактическ|передач|при[её]м|отгруз|shipment|date of (?:delivery|receipt)|получен/i.test(label)) return "delivery";
  if (/плат[её]ж|оплат|payment|paid/i.test(label)) return "payment";
  if (/дата\s+договор|contract\s+date|заключ/i.test(label)) return "signed";
  return "any";
}

function partySide(text: string): "supplier" | "buyer" | "any" {
  if (/поставщик|исполнител|продавец|supplier|vendor|lieferant|fournisseur|fornitore|proveedor|fornecedor|dostawca|leverancier|tedarikçi|供应商/i.test(text)) return "supplier";
  if (/заказчик|покупател|плательщик|customer|buyer|kunde|acheteur|cliente|comprador|odbiorca|koper|alıcı|买方/i.test(text)) return "buyer";
  return "any";
}

function isService(fact: Fact): boolean {
  return /перевоз|монтаж|обучен|пусконалад|сертификац|заземл|transport|fracht|vervoer|nakliye|installation|instal|montage|montaje|montaggio|monta[zż]|training|schulung|formation|formazione|formaci[oó]n|szkol|eğitim|egitim|commissioning|inbetriebnahme|mise en service|inbedrijf|puesta en marcha|avviamento|rozruch|devreye|certificat|zertifiz|aarding|uziem|toprak|运输|安装|培训|调试|认证|接地/i.test(`${fact.item ?? ""} ${fact.label}`);
}

function isBlanketTotal(fact: Fact): boolean {
  if (fact.item || productCodes(`${fact.label} ${fact.item ?? ""}`).length) return false;
  return /^(?:стоимость|сумма|итого|всего|total)(?![\p{L}])/iu.test(fact.label) && /оборудован|переданн|поставленн|отгруженн|всего|итого/i.test(fact.label);
}

function narrowByLabel(fact: Fact, pool: Fact[]): Fact[] {
  const content = normText(fact.label).split(" ").filter((word) => word.length >= 4 && !/стоимост|сумм|итого|всего|рубл|цена|принят|парти/.test(word));
  if (content.length < 2) return pool;
  const score = (source: Fact) => content.filter((word) => {
    const blob = normText(`${source.label} ${source.item ?? ""}`);
    const left = wordStem(word);
    return blob.split(" ").some((part) => {
      const right = wordStem(part);
      return left.length >= 3 && right.length >= 3 && (left === right || left.startsWith(right) || right.startsWith(left));
    });
  }).length;
  const best = Math.max(...pool.map(score));
  if (best < 1) return pool;
  return pool.filter((source) => score(source) === best);
}

function isTotalRow(fact: Fact): boolean {
  const label = `${fact.item ?? ""} ${fact.fragment.rowLabel ?? ""} ${fact.label}`.trim();
  const match = label.match(/^(?:итого|всего|total|summe|insgesamt|gesamt|suma|totale|toplam|totaal|razem|zusammen|合计|总计)\b\s*(.*)$/i);
  if (!match) return false;
  return !/\p{L}{4,}/u.test(match[1] ?? "");
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
  const generic = /^(?:итого|всего|total|summe|insgesamt|gesamt|suma|totale|toplam|totaal|razem|zusammen|合计|总计)$/i;
  if (generic.test(item.trim()) && source.item && generic.test(source.item.trim())) return true;
  if (source.item && sameItem(item, source.item)) {
    if (generic.test(item.trim()) !== generic.test(source.item.trim())) return false;
    return true;
  }
  const blob = `${source.fragment.text} ${source.fragment.rowLabel ?? ""} ${source.docName} ${source.item ?? ""}`;
  const identity = `${source.item ?? ""} ${source.fragment.rowLabel ?? ""}`;
  const codes = productCodes(item);
  if (codes.length && codes.some((code) => (source.item ? identity : blob).toUpperCase().includes(code))) return true;
  if (codes.length && source.item && productCodes(identity).length && codes.some((code) => blob.toUpperCase().includes(code))) return false;
  const number = item.match(/\d{3,}/)?.[0];
  if (number && new RegExp(`(^|\\D)${number}(\\D|$)`).test(blob)) return true;
  const links: { report: RegExp; doc: RegExp }[] = [
    { report: /заземл|ground|earthing|erdung|aarding|terre|tierra|terra|toprak|uziem|接地/, doc: /заземл/ },
    { report: /сертификац|certificat|zertifiz|认证/, doc: /сертификац/ },
    { report: /пусконалад|commission|inbetrieb|调试/, doc: /пусконалад/ },
    { report: /перевоз|transport|fracht|vervoer|nakliye|运输/, doc: /перевоз/ },
    { report: /обучен|train|schulung|formation|formazione|formación|szkol|capacita|participant|uczestnik|teilnehmer|deelnemer|katılımcı|katilimci|eğitim|egitim|培训/, doc: /обучен|протокол/ },
    { report: /монтаж|install|montage|安装/, doc: /монтаж/ },
  ];
  const name = normText(item);
  const link = links.find((entry) => entry.report.test(name));
  return Boolean(link && link.doc.test(normText(`${source.item ?? ""} ${source.docName}`)));
}

function metricScale(from: string, to: string): bigint | null {
  const left = cleanupComparable(from);
  const right = cleanupComparable(to);
  const steps: [string, string, bigint][] = [
    ["г", "кг", 1000n],
    ["мг", "г", 1000n],
    ["м", "км", 1000n],
    ["мин", "час", 60n],
  ];
  for (const [small, large, factor] of steps) {
    if (left === small && right === large) return -factor;
    if (left === large && right === small) return factor;
  }
  return null;
}

function wordStem(word: string): string {
  return word.replace(/(иями|ями|ами|ого|ему|ыми|ими|ых|их|ов|ев|ей|ое|ее|ая|яя|ый|ий|ой|ом|ем|ах|ях|ам|ям|ую|юю|ия|ии|ию|ие|ок|ек|ка|ки|ку|ы|и|а|я|у|ю|е|о|ь)$/u, "");
}

function amountKey(part: Fact): string {
  if (part.parsed.kind === "money" || part.parsed.kind === "quantity") return part.parsed.minor.toString();
  return part.raw;
}

function collapseSameDocument(parts: Fact[]): Fact[] {
  const byDoc = new Map<string, Fact[]>();
  for (const part of parts) {
    const key = `${part.documentId}|${part.docNumber ?? ""}`;
    const list = byDoc.get(key) ?? [];
    list.push(part);
    byDoc.set(key, list);
  }
  const out: Fact[] = [];
  for (const group of byDoc.values()) {
    const distinct = new Set(group.map(amountKey));
    if (distinct.size === 1) {
      const detailed = group.filter((part) => part.item && !/^(?:итого|всего|total|summe|insgesamt)\b/i.test(part.label) && !/^(?:итого|всего|total|summe|insgesamt)\b/i.test(part.fragment.text));
      const chosen = detailed.length ? detailed : group;
      const seen = new Set<string>();
      for (const part of chosen) {
        if (seen.has(part.fragment.anchor)) continue;
        seen.add(part.fragment.anchor);
        out.push(part);
      }
      continue;
    }
    const detailed = group.filter((part) => !isTotalRow(part) && !isBlanketTotal(part));
    const chosen = detailed.length ? detailed : group;
    const seen = new Set<string>();
    for (const part of chosen) {
      const key = `${normText(part.item ?? part.label)}|${amountKey(part)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(part);
    }
  }
  return out;
}

function distinctAmounts(parts: Fact[]): Fact[] {
  const seen = new Map<string, Fact>();
  for (const part of parts) {
    const key = `${part.documentId}|${amountKey(part)}|${normText(part.item ?? "")}`;
    if (!seen.has(key)) seen.set(key, part);
  }
  return [...seen.values()];
}

function additiveShipments(parts: Fact[]): boolean {
  if (parts.length < 2) return false;
  const numbers = new Set(parts.map((part) => part.docNumber ?? part.documentId));
  if (numbers.size === parts.length && parts.every((part) => part.docKind === "waybill" || part.docKind === "act" || isReturnDoc(part))) return true;
  const docs = new Set(parts.map((part) => part.documentId));
  return docs.size === 1 && parts.every((part) => part.item);
}

function cleanupComparable(unit: string): string {
  return unit.toLowerCase().replace(/ё/g, "е").replace(/\./g, "");
}

function isReturnDoc(fact: Fact): boolean {
  return /возврат/i.test(fact.docName) || /^\s*акт возврата/i.test(fact.docText.slice(0, 180));
}

function isDraftDoc(fact: Fact): boolean {
  return /проект|план/i.test(fact.docName) || /^\s*проект/i.test(fact.docText.slice(0, 160));
}

function isTrainingDoc(fact: Fact): boolean {
  return /обучен/i.test(`${fact.docName} ${fact.docText.slice(0, 400)}`) && !/накладн|передано/i.test(fact.docText.slice(0, 500));
}

function isGoodsDoc(fact: Fact): boolean {
  return !isDraftDoc(fact) && !isTrainingDoc(fact) && (isShipmentDoc(fact) || /приход|ордер|при[её]м/i.test(fact.docName));
}

function isShipmentDoc(fact: Fact): boolean {
  return fact.docKind === "waybill" || (fact.docKind === "act" && !isDraftDoc(fact)) || isReturnDoc(fact) || /реестр/i.test(fact.docName);
}

function quantityFocus(label: string): "stock" | "received" | "contract" | "hours" | "any" {
  if (/оприходован|warehouse|lager|entrepôt|entrepot|magazzino|almacén|almacen|armazém|armazem|magazyn|depo|仓库/i.test(label)) return "stock";
  if (/планов/i.test(label)) return "contract";
  if (/за вычетом возврата|принят|получен|поставлен|отгруж|фактическ|accepted|received|geaccepteerd|aceito|less returns|angenommen|abzüglich|abzuglich|accept[eé]|d[eé]duction|menos devol|menos devoluç|al netto|pomniejsz|minus retour|iade|扣除退|shipped/i.test(label)) return "received";
  if (/по договору|under the contract|per contract|laut vertrag|selon le contrat|secondo il contratto|según el contrato|segun el contrato|conforme o contrato|wg umowy|volgens contract|sözleşmeye|sozlesmeye|按合同/i.test(label)) return "contract";
  if (/час|продолжительн|^объем$|^объём$|^volume$|^volumen$|^umfang$|^omvang$|^hacim$|^hours?$|^stunden$|^heures$|^ore$|^horas$|^godziny$|^uren$|^saat$|^工时$/i.test(label)) return "hours";
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
  const metric = metricScale(from, to);
  if (metric != null) {
    if (metric > 0n) return minor * metric;
    if (minor % -metric !== 0n) return null;
    return minor / -metric;
  }
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
  if (/полностью\s+закрыт|закрыт\s+полностью/i.test(fact.label) && /^(да|нет)$/i.test(fact.raw.trim())) {
    const pieces = sources.filter((source) => source.role === "quantity" && source.parsed.kind === "quantity" && /шт/.test(source.parsed.unit));
    const ordered = pieces.filter((source) => source.docKind === "contract" && !isReturnDoc(source));
    const receivedAll = pieces.filter((source) => isGoodsDoc(source) && !isReturnDoc(source) && inPeriod(fact, source));
    const receivedDetailed = receivedAll.filter((source) => !/реестр/i.test(source.docName));
    const received = receivedDetailed.length ? receivedDetailed : receivedAll;
    const returned = pieces.filter((source) => isReturnDoc(source));
    if (ordered.length && received.length) {
      const closed = sumDistinctQuantities(received) - sumDistinctQuantities(returned) >= sumDistinctQuantities(ordered);
      const answer = closed ? "да" : "нет";
      const same = fact.raw.trim().toLowerCase() === answer;
      return {
        sourceValue: answer === "да" ? "Да" : "Нет",
        discrepancy: null,
        status: same ? "match" : "mismatch",
        severity: same ? "low" : "high",
        explanation: same
          ? "Принятое количество закрывает заказ по договору."
          : "Принятое количество меньше заказанного по договору, поэтому заказ ещё не закрыт.",
        evidenceReferences: [...ordered.slice(0, 1), ...received.slice(0, 2), ...returned.slice(0, 1)].map((source) => reference(source.documentId, source.fragment, source.raw)),
      };
    }
  }
  if (/подпис/i.test(fact.label) && /имеет|есть|^да$/i.test(fact.raw.trim())) {
    const number = fact.label.match(/№\s*([0-9A-Za-zА-Яа-я-]+)/)?.[1];
    const docs = sources.filter((source) => number ? source.docName.includes(number) || source.docText.includes(number) : /акт|договор/i.test(source.docName));
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
  if (/^(да|yes|ja|oui|s[iìí]|sim|tak|evet|是|завершен|завершён|выполнено|completed|done|abgeschlossen|termin[ée]|completato|completado|conclu[ií]do|zako[nń]czone|voltooid|tamamland[iı]|已完成)$/i.test(fact.raw.trim()) && /выполнен|сертификац|ввод|обучен|проведен|certification|commissioning|zertifizierung|inbetriebnahme|certificaci[oó]n|certificazione|certifica[cç][aã]o|certyfikacj|certificering|devreye|认证|调试/i.test(fact.label)) {
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
    const affinity = /оприходован|приход|поступил|eingebucht|gebucht|registrad|registrat|enregistr|recorded|przyj[eę]t|posted/i.test(fact.label)
      ? /приход|поступ|оприход|wareneingang|eingang|entrada|entr[eé]e|przych[oó]d|przychod|receipt|入库/i
      : /остат|bestand|saldo|\bstan\b|balance/i.test(fact.label) ? /остат|bestand|saldo|\bstan\b|balance/i
      : /возврат|rückgabe|devoluci|zwrot/i.test(fact.label) ? /возврат|rückgabe|ruckgabe|devoluci|zwrot/i
      : null;
    if (affinity) {
      const narrowed = pool.filter((source) => affinity.test(`${source.fragment.columnHeader ?? ""} ${source.label}`));
      if (narrowed.length) pool = narrowed;
    }
  }
  if (focused === "received") {
    const deliveries = pool.filter((source) => isGoodsDoc(source));
    const detailed = deliveries.filter((source) => !/реестр/i.test(source.docName));
    pool = detailed.length ? detailed : deliveries;
  }
  if (focused === "contract") pool = pool.filter((source) => source.docKind === "contract" || isDraftDoc(source));
  if (focused === "hours") {
    const journal = pool.filter((source) => /журнал/i.test(`${source.docName} ${source.fragment.sheet ?? ""}`));
    if (journal.length) pool = journal;
  }
  if (fact.role === "transport") {
    const direct = pool.filter((source) => /^(достав\w*|транспорт\w*|перевоз\w*|transport\w*|fracht\w*)/i.test(source.label.trim()));
    if (direct.length) pool = direct;
  }
  if (/выполнен/i.test(fact.label)) pool = pool.filter((source) => source.docKind !== "invoice" && !/письм|счет|счёт/i.test(source.docName));
  if (fact.role === "unit_price" && /договор|contract|vertrag|contrat|contratto|contrato|umowa|overeenkomst|sözleşme|sozlesme|合同/i.test(fact.label) && !fact.item) {
    const stated = pool.filter((source) => /цена\s+договора|contract\s+price|vertragspreis|prix\s+du\s+contrat|prezzo\s+del\s+contratto|precio\s+del\s+contrato|cena\s+umowy|contractprijs|合同价/i.test(source.label));
    if (stated.length) pool = stated;
  }
  if (fact.role === "unit_price" && /договор|contract|vertrag|contrat|contratto|contrato|umowa|overeenkomst|sözleşme|sozlesme|合同/i.test(fact.label)) {
    const amended = pool.filter((source) => isAmendmentDoc(source.docName, source.docText));
    const contractual = pool.filter((source) => source.docKind === "contract" || /спецификац|договор|допсоглашен|dopsoglash/i.test(source.docName));
    if (amended.length) pool = amended;
    else if (contractual.length) pool = contractual;
  }
  if (fact.role === "date" && /срок|delivery|deadline|liefer|délai|delai|consegna|plazo|dostaw|lever|teslim|交货/i.test(fact.label)) {
    const stated = pool.filter((source) => source.label === "Срок поставки");
    const amended = (stated.length ? stated : pool).filter((source) => isAmendmentDoc(source.docName, source.docText));
    if (amended.length) pool = amended;
    else if (stated.length) pool = stated;
  }
  if (fact.role === "line_total" && isService(fact)) {
    const journal = pool.filter((source) => /журнал/i.test(source.docName));
    const performed = pool.filter((source) => source.docKind === "act" || source.docKind === "waybill");
    const calculated = pool.filter((source) => /расч[её]т/i.test(source.docName));
    if (journal.length) pool = journal;
    else if (performed.length) pool = performed;
    else if (calculated.length) pool = calculated;
    else pool = pool.filter((source) => source.docKind !== "invoice" && source.docKind !== "contract");
  } else if (fact.role === "line_total" && /оплач|уплач|\bpaid\b|amount paid/i.test(fact.label)) {
    const payments = pool.filter((source) => source.docKind === "payment" || /платеж|оплат|payment/i.test(`${source.docName} ${source.fragment.sheet ?? ""} ${source.fragment.columnHeader ?? ""} ${source.label}`));
    if (payments.length) pool = payments;
  } else if (fact.role === "line_total" && /оборудован|парти|поставк|принят|получ|отгруж|товар|с\s*ндс|including|incl\.?|accepted|received|brutto|mit\s|met\s|avec\s|\bcom\s|con\s|z\s*(?:ндс|vat\b)|dahil|含税|含\s/i.test(`${fact.label} ${fact.fragment.columnHeader ?? ""}`) && !isService(fact)) {
    const shipped = pool.filter((source) => isGoodsDoc(source) && !isService(source));
    if (shipped.length) pool = shipped;
  }
  pool = pool.filter((source) => !isTotalRow(source));
  if (fact.role === "quantity" && fact.parsed.kind === "quantity" && /число|количество/i.test(fact.label) && /поставок|накладн|отгрузок/i.test(fact.label)) {
    const shipments = docs.filter((doc) => /наклад/i.test(doc.name) && !/проект|возврат/i.test(doc.name) && (!fact.contract || contractMentioned(doc.text, fact.contract)));
    const count = BigInt(shipments.length) * 10000n;
    const same = count === fact.parsed.minor;
    return {
      sourceValue: String(shipments.length),
      discrepancy: same ? null : formatSigned(fact.parsed.minor - count, "шт."),
      status: same ? "match" : "mismatch",
      severity: same ? "low" : "medium",
      explanation: shipments.length
        ? `В комплекте ${shipments.length} постав${shipments.length === 1 ? "ка" : "ки"}: ${shipments.map((doc) => doc.name).join(", ")}. Повтор одного файла не считается второй поставкой.`
        : "Накладная поставки в комплекте не найдена.",
      evidenceReferences: shipments.slice(0, 3).map((doc) => reference(doc.id, doc.fragment, doc.text.slice(0, 180))),
      unit: "шт.",
    };
  }
  if (fact.role === "quantity" && fact.parsed.kind === "quantity" && /остал|к поставке|не поставлен/i.test(fact.label)) {
    const pieces = sources.filter((source) => source.role === "quantity" && source.parsed.kind === "quantity" && /шт/.test(source.parsed.unit) && (!fact.contract || !source.contract || sameToken(fact.contract, source.contract)));
    const ordered = pieces.filter((source) => source.docKind === "contract" && !isReturnDoc(source));
    const receivedAll = pieces.filter((source) => isGoodsDoc(source) && !isReturnDoc(source) && inPeriod(fact, source));
    const receivedDetailed = receivedAll.filter((source) => !/реестр/i.test(source.docName));
    const received = receivedDetailed.length ? receivedDetailed : receivedAll;
    if (ordered.length && received.length) {
      const left = sumDistinctQuantities(ordered) - sumDistinctQuantities(received);
      const same = left === fact.parsed.minor;
      return {
        sourceValue: formatScaled(left, fact.parsed.unit),
        discrepancy: same ? null : formatSigned(fact.parsed.minor - left, fact.parsed.unit),
        status: same ? "match" : "mismatch",
        severity: same ? "low" : "high",
        explanation: `Остаток — это количество по договору минус принятое за период: ${formatScaled(left, fact.parsed.unit)}.`,
        evidenceReferences: [...ordered.slice(0, 1), ...received.slice(0, 2)].map((source) => reference(source.documentId, source.fragment, source.raw)),
        unit: fact.parsed.unit,
      };
    }
  }
  if (!pool.length || (fact.role !== "quantity" && fact.role !== "line_total" && fact.role !== "unit_price" && fact.role !== "transport" && fact.role !== "date")) return null;

  const factors = kitFactors(pool.map((source) => source.docText));
  if (fact.parsed.kind === "quantity" && focused === "any") {
    const values = new Map<string, { minor: bigint; source: Fact }>();
    for (const source of pool) {
      if (source.parsed.kind !== "quantity") continue;
      const scaled = scaleToUnit(source.parsed.minor, source.parsed.unit, fact.parsed.unit, `${fact.item ?? ""} ${source.item ?? ""}`, factors);
      if (scaled == null) continue;
      values.set(scaled.toString(), { minor: scaled, source });
    }
    const matchedValue = [...values.values()].find((item) => item.minor === fact.parsed.minor);
    if (values.size !== 1 && !matchedValue) return null;
    const only = matchedValue ?? [...values.values()][0];
    if (!only) return null;
    const same = only.minor === fact.parsed.minor;
    return {
      sourceValue: only.source.raw,
      discrepancy: same ? null : formatSigned(fact.parsed.minor - only.minor, fact.parsed.unit),
      status: same ? "match" : "mismatch",
      severity: same ? "low" : "medium",
      explanation: `В отчёте ${fact.raw}, в «${only.source.docName}» — ${only.source.raw}.`,
      evidenceReferences: [reference(only.source.documentId, only.source.fragment, only.source.raw)],
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
    const collapsed = collapseSameDocument(kept);
    const disagreed = distinctAmounts(collapsed.filter((part) => !isReturnDoc(part)));
    const sameQuantity = new Set(disagreed.map(amountKey)).size <= 1;
    if (disagreed.length > 1 && !sameQuantity && !additiveShipments(disagreed)) {
      return {
        sourceValue: disagreed.map((part) => part.raw).slice(0, 3).join(" и "),
        discrepancy: null,
        status: "needs_review",
        severity: "medium",
        explanation: `По «${fact.label}» документы называют разные значения: ${disagreed.map((part) => `${part.raw} (${part.docName})`).join("; ")}. В отчёте указано ${fact.raw}. По комплекту нельзя выбрать одно из них.`,
        evidenceReferences: disagreed.map((part) => reference(part.documentId, part.fragment, part.raw)),
        unit: fact.parsed.unit,
      };
    }
    total = 0n;
    const summed = fact.net ? collapsed : sameQuantity ? disagreed.slice(0, 1) : disagreed;
    for (const part of summed) {
      if (part.parsed.kind !== "quantity") continue;
      const scaled = scaleToUnit(part.parsed.minor, part.parsed.unit, fact.parsed.unit, `${fact.item ?? ""} ${part.item ?? ""}`, factors);
      if (scaled == null) continue;
      total += scaled * (isReturnDoc(part) ? -1n : 1n);
    }
    const same = total === fact.parsed.minor;
    return {
      sourceValue: formatScaled(total, fact.parsed.unit),
      discrepancy: same ? null : formatSigned(fact.parsed.minor - total, fact.parsed.unit),
      status: same ? "match" : "mismatch",
      severity: same ? "low" : "high",
      explanation: kept.length > 1
        ? `Количество собрано по документам одной операции${fact.net ? " за вычетом возврата" : ""}: ${kept.map((part) => `${part.raw} (${part.docName})`).join(", ")}. Итого ${formatScaled(total, fact.parsed.unit)}.`
        : `В отчёте ${fact.raw}, в «${kept[0]?.docName}» — ${kept[0]?.raw}.`,
      evidenceReferences: (fact.net ? collapsed : disagreed).map((part) => reference(part.documentId, part.fragment, part.raw)),
      unit: fact.parsed.unit,
    };
  }
  if (fact.parsed.kind === "money" && (fact.role === "line_total" || fact.role === "unit_price" || fact.role === "transport")) {
    pool = narrowByLabel(fact, pool);
    if (!/%/.test(fact.raw)) pool = pool.filter((source) => !/%/.test(source.raw));
    if (fact.basis === "gross" || fact.basis === "net" || fact.basis === "tax") {
      const sameBasis = pool.filter((source) => source.basis === fact.basis);
      if (sameBasis.length) pool = sameBasis;
    }
    const detailed = pool.filter((source) => !isBlanketTotal(source));
    if (detailed.length) pool = detailed;
    let total = 0n;
    const parts: Fact[] = [];
    for (const source of pool) {
      if (source.parsed.kind !== "money") continue;
      if (source.basis === "tax" && fact.basis !== "tax") continue;
      if (!fact.net && isReturnDoc(source)) continue;
      const converted = convertMoney(source.parsed.minor, source.basis ?? "unknown", fact.basis ?? "unknown");
      if (converted == null) continue;
      total += converted * (fact.net && isReturnDoc(source) ? -1n : 1n);
      parts.push(source);
    }
    if (!parts.length) return null;
    const collapsedMoney = collapseSameDocument(parts);
    const disagreedMoney = distinctAmounts(collapsedMoney.filter((part) => !isReturnDoc(part)));
    const sameMoney = new Set(disagreedMoney.map(amountKey)).size <= 1;
    const acrossDocuments = new Set(disagreedMoney.map((part) => part.documentId)).size > 1;
    if (fact.role === "line_total" && disagreedMoney.length > 1 && !sameMoney && !additiveShipments(disagreedMoney) && acrossDocuments) {
      return {
        sourceValue: disagreedMoney.map((part) => part.raw).slice(0, 3).join(" и "),
        discrepancy: null,
        status: "needs_review",
        severity: "medium",
        explanation: `По «${fact.label}» документы называют разные суммы: ${disagreedMoney.map((part) => `${part.raw} (${part.docName})`).join("; ")}. В отчёте указано ${fact.raw}. По комплекту нельзя выбрать одну из них.`,
        evidenceReferences: disagreedMoney.map((part) => reference(part.documentId, part.fragment, part.raw)),
        unit: "₽",
      };
    }
    const moneyParts = fact.role === "unit_price" ? collapsedMoney.slice(0, 1) : fact.net ? collapsedMoney : sameMoney ? disagreedMoney.slice(0, 1) : disagreedMoney;
    total = 0n;
    for (const part of moneyParts) {
      if (part.parsed.kind !== "money") continue;
      const converted = convertMoney(part.parsed.minor, part.basis ?? "unknown", fact.basis ?? "unknown");
      if (converted == null) continue;
      total += converted * (fact.net && isReturnDoc(part) ? -1n : 1n);
    }
    const tolerance = statedTolerance(`${fact.docText}\n${parts.map((part) => part.docText).join("\n")}`);
    const delta = fact.parsed.kind === "money" ? fact.parsed.minor - total : 0n;
    const same = fact.parsed.kind === "money" && (delta === 0n || (tolerance != null && delta <= tolerance && delta >= -tolerance));
    return {
      sourceValue: formatScaled(total, "₽"),
      discrepancy: same ? null : formatSigned(fact.parsed.minor - total, "₽"),
      status: same ? "match" : "mismatch",
      severity: same ? "low" : "high",
      explanation: `Сумма собрана из строк одной операции${fact.net ? " за вычетом возврата" : ""}: ${moneyParts.slice(0, 8).map((part) => `${part.raw} (${part.docName})`).join(", ")}. Итого ${formatScaled(total, "₽")}.`,
      evidenceReferences: moneyParts.map((part) => reference(part.documentId, part.fragment, part.raw)),
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
  if (fact.role === "quantity" && quantityFocus(fact.label) === "received") {
    const goods = found.filter((source) => isGoodsDoc(source));
    if (goods.length) found = goods;
  }
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
      if (exact.length >= 1 && exact[0]) {
        return matched(base, fact, exact.slice(0, 3), "Совпадает по точному тексту.");
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
    if (fact.role === "text" && fact.parsed.kind === "text" && fact.parsed.norm.length >= 4) {
      const hits = docs.filter((doc) => normText(doc.text).includes(fact.parsed.norm));
      if (hits.length) {
        const evidence = hits.slice(0, 3).map((doc) => ({ ...fact, raw: fact.raw, docName: doc.name, docText: doc.text, documentId: doc.id, fragment: doc.fragment }));
        return matched(base, fact, evidence, `«${fact.raw}» встречается в ${hits.map((doc) => doc.name).slice(0, 3).join(", ")}.`);
      }
    }
    const damaged = docs.filter((doc) => /поврежд|не\s*чита|стерт|смазан/i.test(doc.text));
    const relatedDamage = damaged.filter((doc) => {
      const blob = normText(doc.text);
      return normText(fact.label).split(" ").some((word) => word.length >= 6 && blob.includes(word.slice(0, 6)));
    });
    if (relatedDamage.length) {
      return finish(base, {
        sourceValue: "значение не прочитано",
        discrepancy: null,
        status: "needs_review",
        severity: "medium",
        explanation: `В «${relatedDamage[0]?.name ?? "документе"}» есть поле «${fact.label}», но значение не прочитано: документ сообщает о повреждении. План или договор не заменяют нечитаемый факт.`,
        evidenceReferences: relatedDamage.slice(0, 2).map((doc) => reference(doc.id, doc.fragment, doc.text.slice(0, 180))),
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

  if (fact.role === "item_name") {
    const listed = found.filter((source) => sameItem(fact.raw, source.raw));
    if (listed.length) return matched(base, fact, listed, `«${fact.raw}» есть в перечне наименований первичных документов. Остальные строки этого перечня — другие позиции.`);
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
  if (fact.parsed.kind === "money" && primary.parsed.kind === "money") {
    const tolerance = statedTolerance(`${fact.docText}\n${primary.docText}`);
    const gap = fact.parsed.minor - primary.parsed.minor;
    if (tolerance != null && gap <= tolerance && gap >= -tolerance) {
      return matched(base, fact, ordered, `Источник подтверждает «${fact.label}» в пределах указанного допуска.`);
    }
  }
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
  if ((report.role === "line_total" || report.role === "unit_price") && source.docKind === "contract" && !source.item && !/договор|contract|vertrag|contrat|contratto|contrato|umowa|overeenkomst|sözleşme|sozlesme|合同/i.test(report.label)) return false;
  if (report.role === "item_name" && !sameItem(report.raw, source.raw)) return false;
  if (report.role === "text" && !similarText(report.label, source.label)) return false;
  if ((report.role === "inn" || report.role === "counterparty") && partySide(report.label) !== "any") {
    const labeled = partySide(source.label);
    const got = labeled !== "any" ? labeled : partySide(source.fragment.text);
    if (got === "any" && !/договор/i.test(source.docName)) return false;
    if (got !== "any" && got !== partySide(report.label)) return false;
  }
  if (report.role === "date" && /дата\s+договор|contract\s+date|vertragsdatum|date\s+du\s+contrat|data\s+del\s+contratto|fecha\s+del\s+contrato|data\s+do\s+contrato|data\s+umowy|contractdatum|sözleşme\s+tarihi|合同日期/i.test(report.label)) {
    if (/срок|delivery|deadline|liefer|délai|delai|consegna|plazo|dostaw|lever|teslim|交货/i.test(source.label) || source.docKind !== "contract" || isAmendmentDoc(source.docName, source.docText)) return false;
  }
  if (report.role === "date") {
    const wanted = dateKind(report.label);
    const got = dateKind(`${source.label} ${source.fragment.columnHeader ?? ""}`);
    if (wanted !== "any" && got !== wanted) return false;
  }
  if (needsItem(report.role) && report.item && !mentionsItem(report.item, source)) return false;
  if (!report.item && (report.role === "quantity" || report.role === "unit_price" || report.role === "line_total")) {
    const genericTotal = /^(?:итого|всего|total|summe|insgesamt|gesamt|suma|totale|toplam|totaal|razem|zusammen|合计|总计)(?![\p{L}])/iu.test(report.label);
    const words = normText(report.label.replace(/[A-ZА-ЯЁa-zа-яё]{0,8}-?\d{1,6}\/\d{2,4}/gi, " ")).split(" ").filter((word) => word.length >= 4 && !/договор|количеств|стоимост|учетом|изменен|принят|получен|передан|отгружен|показател|единиц|парти|возврат|вычет|октябр|ноябр|декабр|январ|феврал|сентябр|август|месяц/.test(word));
    const blob = normText(`${source.label} ${source.item ?? ""} ${source.fragment.rowLabel ?? ""} ${source.docName} ${source.fragment.text}`);
    const mentioned = (word: string) => {
      if (/участник/.test(word) && /чел|слушател|человек/.test(blob)) return true;
      if (blob.includes(word)) return true;
      const left = wordStem(word);
      return left.length >= 3 && blob.split(" ").some((part) => {
        const right = wordStem(part);
        return right.length >= 3 && (left === right || left.startsWith(right) || right.startsWith(left));
      });
    };
    const paid = report.role === "line_total" && /оплач|уплач|paid/.test(normText(report.label));
    const paidSheet = /платеж|оплат|payment/i.test(`${source.docName} ${source.fragment.sheet ?? ""}`);
    const paidSource = paid && (source.docKind === "payment" || paidSheet) && /плат|payment|сумм|amount|tutar|bedrag|оплат/.test(`${blob} ${source.fragment.sheet ?? ""}`);
    if (!genericTotal && words.length && !words.some(mentioned) && !similarText(report.label, source.label) && !paidSource) return false;
    if (!genericTotal && !words.length && paid && !paidSource) return false;
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
  if (parsed.kind === "id") return normalizeToken(parsed.token);
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
