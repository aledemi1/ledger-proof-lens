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

export interface FileProblem {
  fileName: string;
  reason: string;
}

/** Roles a language model assigned to labels the rule dictionary does not know, keyed by normalized label. */
export type RoleHints = Map<string, Role>;

export interface UnknownLabel {
  label: string;
  sample: string;
}

export type Parsed =
  | { kind: "money"; minor: bigint }
  | { kind: "quantity"; minor: bigint; unit: string }
  | { kind: "date"; iso: string }
  | { kind: "id"; token: string }
  | { kind: "text"; norm: string }
  | { kind: "missing" };

export type DocKind = "report" | "act" | "waybill" | "invoice" | "contract" | "payment" | "other";

export interface Fact {
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

export const prefer: Record<Role, DocKind[]> = {
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

export function roleFromUnit(label: string, raw: string, unitHint?: string): { role: Role; viaModel: boolean } | null {
  if (unitHint && isDateUnit(unitHint) && parseDate(raw)) return { role: "date", viaModel: false };
  if (unitHint && isQuantityUnit(unitHint) && parseQuantity(raw, unitHint)) return { role: "quantity", viaModel: false };
  if (unitHint && isMoneyUnit(unitHint) && parseMoney(raw) != null) return { role: /цена|price|tarif|rate|preis|prix|precio|prezzo|preço|preco|cena|prijs|fiyat|单价/i.test(label) ? "unit_price" : "line_total", viaModel: false };
  return null;
}

export function resolveRole(label: string, raw: string, hints: RoleHints, unitHint?: string): { role: Role; viaModel: boolean } | null {
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

export function buildFacts(doc: PreparedDoc, hints: RoleHints): Fact[] {
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
    if (fragment) facts.push(makeFact(doc, kind, docNumber, role, verticalLabel, raw, hinted(fragment, verticalLabel, unit || fragment.unitHint)));
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
          facts.push(makeFact(doc, kind, docNumber, role, row.label, raw, hinted(fragment, row.label, row.unit || fragment.unitHint)));
        } else indicatorTable = false;
      }
      for (const parsedLine of parseStatements(fragment.text, hints)) {
        facts.push(makeFact(doc, kind, docNumber, parsedLine.role, parsedLine.label, parsedLine.value, fragment, undefined, parsedLine.viaModel));
      }
      for (const row of parseIndicatorRows(fragment.text)) {
        const role = indicatorRole(row.label, row.unit);
        const raw = row.unit ? `${row.value} ${row.unit}` : row.value;
        facts.push(makeFact(doc, kind, docNumber, role, row.label, raw, hinted(fragment, row.label, row.unit || fragment.unitHint)));
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
    const accepted = doc.isReport ? null : fragment.text.match(/(?:принят\w*|передан\w*|отгружен\w*|получен\w*|накладн\w*[^.\n]{0,40}?от)[^.\n]{0,40}?(\d{2}\.\d{2}\.\d{4})/i);
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

export function isVerticalUnit(line: string): boolean {
  return /^(шт\.?|₽|руб\.?|ч|час\w*|акад\.?\s*ч\.?|мес\.?|чел\.?|г|кг|км|м|мин\.?)$/i.test(line.trim());
}

export function handedItem(text: string, index: number): string | undefined {
  const before = text.slice(Math.max(0, index - 80), index).replace(/^.*(?:\.|:)\s*/, "").trim();
  const item = before.replace(/^(?:товар|номенклатура|наименование)\s*/i, "").trim();
  return item.length >= 3 ? item : undefined;
}

export function indicatorRole(label: string, unit: string): Role {
  const known = detectRole(label);
  if ((known === "contract_number" || known === "date") && /₽|руб/i.test(unit)) return /цена|тариф/i.test(label) ? "unit_price" : "line_total";
  if (known === "contract_number" || known === "counterparty" || known === "date" || known === "inn" || known === "transport" || known === "unit_price" || known === "quantity" || known === "line_total") return known;
  if (/₽|руб/i.test(unit)) return /цена|тариф/i.test(label) ? "unit_price" : "line_total";
  return "quantity";
}

export function unitPriceOf(row: { quantity: string; gross: string }): string | null {
  const qty = parseQuantity(row.quantity);
  const gross = parseMoney(row.gross);
  if (!qty || gross == null || qty.minor <= 0n) return null;
  const price = (gross * 10000n) / qty.minor;
  return formatScaled(price, "₽");
}

export function serviceName(name: string, text: string): string | undefined {
  const blob = `${name} ${text.slice(0, 240)}`;
  const stem = blob.match(/перевоз\w*|монтаж\w*|обучен\w*|пусконалад\w*|сертификац\w*|заземл\w*/i)?.[0];
  return stem?.toLowerCase();
}

export function noteModel(check: CheckResult, fact: Fact, sources: Fact[]): CheckResult {
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

export function hinted(fragment: Fragment, label: string, unit: string | undefined): Fragment {
  const hint = unit || fragment.unitHint;
  return { ...fragment, label, ...(hint ? { unitHint: hint } : {}) };
}

export function makeFact(
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

export function sameRow(left: Fragment, right: Fragment): boolean {
  const row = left.anchor.match(/r(\d+)/)?.[1];
  return Boolean(row && left.sheet === right.sheet && right.anchor.includes(`r${row}c`));
}

export function rowContract(fact: Fact, fragments: Fragment[]): string | undefined {
  const sibling = fragments.find((item) => sameRow(fact.fragment, item) && item.columnHeader && /договор|contract/i.test(item.columnHeader));
  return sibling ? parseContractToken(sibling.text) ?? undefined : undefined;
}

export function sumDistinctQuantities(list: Fact[]): bigint {
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

export function rowOperationDate(fact: Fact, fragments: Fragment[]): string | null {
  const sibling = fragments.find((item) => sameRow(fact.fragment, item) && parseDate(item.text));
  return sibling ? parseDate(sibling.text) : null;
}

export function inherit(facts: Fact[], text: string, fragments: Fragment[]): Fact[] {
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

export function parseByRole(role: Role, raw: string, unitHint?: string): Parsed {
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

export function parseStatements(text: string, hints: RoleHints): { role: Role; label: string; value: string; viaModel: boolean }[] {
  const parts = text.split(/(?<=\.)\s+/).map((part) => part.trim()).filter(Boolean);
  const sentences = parts.length > 1 ? parts : [text];
  const found: { role: Role; label: string; value: string; viaModel: boolean }[] = [];
  for (const sentence of sentences) {
    const parsed = parseLine(sentence, hints);
    if (parsed) found.push(parsed);
  }
  return found;
}

export function parseLine(text: string, hints: RoleHints): { role: Role; label: string; value: string; viaModel: boolean } | null {
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

export function isStatusValue(raw: string): boolean {
  return /^(да|нет|yes|no|ja|nein|oui|non|s[iì]|sim|n[aã]o|tak|nie|evet|hay[ıi]r|是|否|завершен\w*|завершён\w*|выполнено|completed|done)$/i.test(raw.trim());
}

export function isAmendmentDoc(name: string, text: string): boolean {
  if (/допсоглашен|dopsoglash|amendment|addendum|avenant|nachtrag/i.test(name)) return true;
  return /^[\s\S]{0,80}дополнительн\w*\s+соглашен/i.test(text);
}

export function dateKind(label: string): "deadline" | "delivery" | "payment" | "signed" | "any" {
  if (/срок|deadline|lieferfrist|d[eé]lai|delai|consegna|plazo|dostaw|leverterm|teslim|交货期/i.test(label)) return "deadline";
  if (/фактическ|передач|при[её]м|отгруз|shipment|date of (?:delivery|receipt)|получен/i.test(label)) return "delivery";
  if (/плат[её]ж|оплат|payment|paid/i.test(label)) return "payment";
  if (/дата\s+договор|contract\s+date|заключ/i.test(label)) return "signed";
  return "any";
}

export function partySide(text: string): "supplier" | "buyer" | "any" {
  if (/поставщик|исполнител|продавец|supplier|vendor|lieferant|fournisseur|fornitore|proveedor|fornecedor|dostawca|leverancier|tedarikçi|供应商/i.test(text)) return "supplier";
  if (/заказчик|покупател|плательщик|customer|buyer|kunde|acheteur|cliente|comprador|odbiorca|koper|alıcı|买方/i.test(text)) return "buyer";
  return "any";
}

export function isService(fact: Fact): boolean {
  const line = `${fact.item ?? ""} ${fact.label} ${fact.fragment.rowLabel ?? ""}`;
  if (/услуг|services?|dienst|prestation|servicio|servi[cç]o|hizmet|服务|перевоз|монтаж|обучен|пусконалад|сертификац|заземл|transport|fracht|vervoer|nakliye|installation|instal|montage|montaje|montaggio|monta[zż]|training|schulung|formation|formazione|formaci[oó]n|szkol|eğitim|egitim|commissioning|inbetriebnahme|mise en service|inbedrijf|puesta en marcha|avviamento|rozruch|devreye|certificat|zertifiz|aarding|uziem|toprak|运输|安装|培训|调试|认证|接地/i.test(line)) return true;
  if (/журнал|реестр|наклад|спецификац|склад|отчет|отчёт/i.test(fact.docName)) return false;
  return /услуг|монтаж|обучен|перевоз|пусконалад|сертификац|заземл/i.test(fact.docName);
}

export function isBlanketTotal(fact: Fact): boolean {
  if (fact.item || productCodes(`${fact.label} ${fact.item ?? ""}`).length) return false;
  return /^(?:стоимость|сумма|итого|всего|total)(?![\p{L}])/iu.test(fact.label) && /оборудован|переданн|поставленн|отгруженн|всего|итого/i.test(fact.label);
}

export function narrowByLabel(fact: Fact, pool: Fact[]): Fact[] {
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

export function isTotalRow(fact: Fact): boolean {
  const label = `${fact.item ?? ""} ${fact.fragment.rowLabel ?? ""} ${fact.label}`.trim();
  const match = label.match(/^(?:итого|всего|total|summe|insgesamt|gesamt|suma|totale|toplam|totaal|razem|zusammen|合计|总计)\b\s*(.*)$/i);
  if (!match) return false;
  return !/\p{L}{4,}/u.test(match[1] ?? "");
}

export function orgTokens(name: string): string[] {
  return normText(name).split(" ").filter((word) => word.length > 4 && !/обществ|компани|ограничен/.test(word));
}

export function innBeside(text: string, inn: string, token: string): boolean {
  const hay = normText(text);
  const orgAt = hay.indexOf(normText(token));
  const innAt = hay.indexOf(inn);
  if (orgAt < 0 || innAt < 0) return false;
  const between = hay.slice(Math.min(orgAt, innAt), Math.max(orgAt, innAt));
  return !/\d{10}|\d{12}/.test(between);
}

export function mentionsItem(item: string, source: Fact): boolean {
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

export function metricScale(from: string, to: string): bigint | null {
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

export function wordStem(word: string): string {
  return word.replace(/(иями|ями|ами|ого|ему|ыми|ими|ых|их|ов|ев|ей|ое|ее|ая|яя|ый|ий|ой|ом|ем|ах|ях|ам|ям|ую|юю|ия|ии|ию|ие|ок|ек|ка|ки|ку|ы|и|а|я|у|ю|е|о|ь)$/u, "");
}

export function amountKey(part: Fact): string {
  if (part.parsed.kind === "money" || part.parsed.kind === "quantity") return part.parsed.minor.toString();
  return part.raw;
}

export function collapseSameDocument(parts: Fact[]): Fact[] {
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

export function distinctAmounts(parts: Fact[]): Fact[] {
  const seen = new Map<string, Fact>();
  for (const part of parts) {
    const key = `${part.documentId}|${amountKey(part)}|${normText(part.item ?? "")}`;
    if (!seen.has(key)) seen.set(key, part);
  }
  return [...seen.values()];
}

export function preferNewer(parts: Fact[]): { kept: Fact[]; older: Fact[] } {
  const documents = new Set(parts.map((part) => part.documentId));
  if (documents.size < 2) return { kept: parts, older: [] };
  const dated = parts.filter((part) => part.operationDate);
  if (dated.length < 2) return { kept: parts, older: [] };
  const newest = dated.map((part) => part.operationDate ?? "").sort().at(-1) ?? "";
  const older = dated.filter((part) => part.operationDate !== newest);
  if (!older.length || new Set(dated.map(amountKey)).size <= 1) return { kept: parts, older: [] };
  const subject = new Set(parts.map((part) => normText(`${part.item ?? ""} ${part.label}`)));
  if (subject.size > 1) return { kept: parts, older: [] };
  return { kept: dated.filter((part) => part.operationDate === newest), older };
}

export function dateNote(older: Fact[]): string {
  if (!older.length) return "";
  const listed = older.map((part) => `${part.docName}${part.operationDate ? ` от ${part.operationDate.split("-").reverse().join(".")}` : ""}`).join(", ");
  return ` Более новый документ имеет приоритет. Более ранние не вошли в расчёт: ${listed}.`;
}

export function additiveShipments(parts: Fact[]): boolean {
  if (parts.length < 2) return false;
  const numbers = new Set(parts.map((part) => part.docNumber ?? part.documentId));
  if (numbers.size === parts.length && parts.every((part) => part.docKind === "waybill" || part.docKind === "act" || isReturnDoc(part))) return true;
  const docs = new Set(parts.map((part) => part.documentId));
  return docs.size === 1 && parts.every((part) => part.item);
}

export function cleanupComparable(unit: string): string {
  return unit.toLowerCase().replace(/ё/g, "е").replace(/\./g, "");
}

export function isReturnDoc(fact: Fact): boolean {
  return /возврат/i.test(fact.docName) || /^\s*акт возврата/i.test(fact.docText.slice(0, 180));
}

export function isDraftDoc(fact: Fact): boolean {
  return /проект|план/i.test(fact.docName) || /^\s*проект/i.test(fact.docText.slice(0, 160));
}

export function isTrainingDoc(fact: Fact): boolean {
  return /обучен/i.test(`${fact.docName} ${fact.docText.slice(0, 400)}`) && !/накладн|передано/i.test(fact.docText.slice(0, 500));
}

export function isGoodsDoc(fact: Fact): boolean {
  return !isDraftDoc(fact) && !isTrainingDoc(fact) && (isShipmentDoc(fact) || /приход|ордер|при[её]м/i.test(fact.docName));
}

export function isShipmentDoc(fact: Fact): boolean {
  return fact.docKind === "waybill" || (fact.docKind === "act" && !isDraftDoc(fact)) || isReturnDoc(fact) || /реестр/i.test(fact.docName);
}

export function quantityFocus(label: string): "stock" | "received" | "contract" | "hours" | "any" {
  if (/оприходован|warehouse|lager|entrepôt|entrepot|magazzino|almacén|almacen|armazém|armazem|magazyn|depo|仓库/i.test(label)) return "stock";
  if (/планов/i.test(label)) return "contract";
  if (/за вычетом возврата|принят|получен|поставлен|отгруж|фактическ|accepted|received|geaccepteerd|aceito|less returns|angenommen|abzüglich|abzuglich|accept[eé]|d[eé]duction|menos devol|menos devoluç|al netto|pomniejsz|minus retour|iade|扣除退|shipped/i.test(label)) return "received";
  if (/по договору|under the contract|per contract|laut vertrag|selon le contrat|secondo il contratto|según el contrato|segun el contrato|conforme o contrato|wg umowy|volgens contract|sözleşmeye|sozlesmeye|按合同/i.test(label)) return "contract";
  if (/час|продолжительн|^объем$|^объём$|^volume$|^volumen$|^umfang$|^omvang$|^hacim$|^hours?$|^stunden$|^heures$|^ore$|^horas$|^godziny$|^uren$|^saat$|^工时$/i.test(label)) return "hours";
  return "any";
}

export function inPeriod(fact: Fact, source: Fact): boolean {
  if (!fact.cutoff || !source.operationDate) return true;
  const marker = `${fact.label} ${fact.fragment.rowLabel ?? ""}`;
  if (/№\s*\d+/.test(marker) || /^\d{3,}$/.test(fact.fragment.rowLabel ?? "")) return true;
  return source.operationDate <= fact.cutoff;
}

export function scaleToUnit(minor: bigint, from: string, to: string, item: string, factors: Map<string, number>): bigint | null {
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


export function detectKind(name: string, text: string): DocKind {
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

export function sameUnit(a: string, b: string): boolean {
  const left = a.toLowerCase().replace(/ё/g, "е").replace(/\./g, "");
  const right = b.toLowerCase().replace(/ё/g, "е").replace(/\./g, "");
  return left === right;
}

export function detectNumber(kind: DocKind, name: string, text: string): string | undefined {
  const blob = `${name}\n${text.slice(0, 1800)}`;
  if (kind === "contract") return parseContractToken(blob) ?? undefined;
  const explicit = blob.match(/(?:накладн\w*|акт|сч[её]т)\s*№\s*([0-9A-Za-zА-Яа-я\-\/]+)/i);
  if (explicit?.[1]) return explicit[1].replace(/[.,;]+$/, "");
  const fromName = name.match(/(\d{1,6})/);
  return fromName?.[1];
}
