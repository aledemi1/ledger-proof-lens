import type { CheckNote, CheckResult, CheckStatus, EvidenceReference, Severity } from "@/types/audit";
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
import {
  PreparedDoc,
  FileProblem,
  RoleHints,
  UnknownLabel,
  Parsed,
  DocKind,
  Fact,
  prefer,
  roleFromUnit,
  resolveRole,
  buildFacts,
  isVerticalUnit,
  handedItem,
  indicatorRole,
  unitPriceOf,
  serviceName,
  noteModel,
  hinted,
  makeFact,
  sameRow,
  rowContract,
  sumDistinctQuantities,
  rowOperationDate,
  inherit,
  parseByRole,
  parseStatements,
  parseLine,
  isStatusValue,
  isAmendmentDoc,
  dateKind,
  partySide,
  isService,
  isBlanketTotal,
  narrowByLabel,
  isTotalRow,
  orgTokens,
  innBeside,
  mentionsItem,
  metricScale,
  wordStem,
  amountKey,
  collapseSameDocument,
  distinctAmounts,
  preferNewer,
  earlierDocuments,
  additiveShipments,
  cleanupComparable,
  isReturnDoc,
  isDraftDoc,
  isTrainingDoc,
  isGoodsDoc,
  isShipmentDoc,
  quantityFocus,
  inPeriod,
  scaleToUnit,
  detectKind,
  detectNumber,
  sameUnit,
} from "./reconcile-facts";

export function assess(fact: Fact, found: Fact[], sources: Fact[], docs: { id: string; name: string; text: string; fragment: Fragment }[]): {
  sourceValue: string | null;
  discrepancy: string | null;
  status: CheckStatus;
  severity: Severity;
  explanation: CheckNote[];
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
        explanation: [{ code: same ? "order_closed" : "order_open" }],
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
        explanation: [{ code: "blank_signature", label: fact.label, report: fact.raw }],
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
        explanation: [{ code: "payment_purpose", number, contract: fact.parsed.token }],
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
          explanation: [{ code: "completion_letter", label: fact.label }],
          evidenceReferences: [],
        };
      }
      return {
        sourceValue: null,
        discrepancy: null,
        status: "not_found",
        severity: "high",
        explanation: [{ code: "completion_missing", label: fact.label }],
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
        ? [{ code: "shipment_count", count: shipments.length, names: shipments.map((doc) => doc.name).join(", ") }]
        : [{ code: "shipment_none" }],
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
        explanation: [{ code: "remainder", value: formatScaled(left, fact.parsed.unit) }],
        evidenceReferences: [...ordered.slice(0, 1), ...received.slice(0, 2)].map((source) => reference(source.documentId, source.fragment, source.raw)),
        unit: fact.parsed.unit,
      };
    }
  }
  if (!pool.length || (fact.role !== "quantity" && fact.role !== "line_total" && fact.role !== "unit_price" && fact.role !== "transport" && fact.role !== "date")) return null;

  const factors = kitFactors(pool.map((source) => source.docText));
  if (fact.parsed.kind === "quantity" && focused === "any") {
    const reportQuantity = fact.parsed;
    const values = new Map<string, { minor: bigint; source: Fact }>();
    for (const source of pool) {
      const parsed = source.parsed;
      if (parsed.kind !== "quantity") continue;
      const scaled = scaleToUnit(parsed.minor, parsed.unit, reportQuantity.unit, `${fact.item ?? ""} ${source.item ?? ""}`, factors);
      if (scaled == null) continue;
      values.set(scaled.toString(), { minor: scaled, source });
    }
    const matchedValue = [...values.values()].find((item) => item.minor === reportQuantity.minor);
    if (values.size !== 1 && !matchedValue) return null;
    const only = matchedValue ?? [...values.values()][0];
    if (!only) return null;
    const same = only.minor === reportQuantity.minor;
    return {
      sourceValue: only.source.raw,
      discrepancy: same ? null : formatSigned(reportQuantity.minor - only.minor, reportQuantity.unit),
      status: same ? "match" : "mismatch",
      severity: same ? "low" : "medium",
      explanation: [{ code: "report_vs_doc", report: fact.raw, document: only.source.docName, source: only.source.raw }],
      evidenceReferences: [reference(only.source.documentId, only.source.fragment, only.source.raw)],
      unit: reportQuantity.unit,
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
        explanation: [{ code: "values_disagree", label: fact.label, parts: disagreed.map((part) => `${part.raw} (${part.docName})`).join("; "), report: fact.raw }],
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
        ? [{ code: "quantity_collected", net: Boolean(fact.net), parts: kept.map((part) => `${part.raw} (${part.docName})`).join(", "), total: formatScaled(total, fact.parsed.unit) }]
        : [{ code: "report_vs_doc", report: fact.raw, document: kept[0]?.docName ?? "", source: kept[0]?.raw ?? "" }],
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
    let disagreedMoney = distinctAmounts(collapsedMoney.filter((part) => !isReturnDoc(part)));
    const newer = fact.role === "line_total" && !additiveShipments(disagreedMoney) ? preferNewer(disagreedMoney) : { kept: disagreedMoney, older: [] as Fact[] };
    if (newer.older.length) disagreedMoney = newer.kept;
    const sameMoney = new Set(disagreedMoney.map(amountKey)).size <= 1;
    const acrossDocuments = new Set(disagreedMoney.map((part) => part.documentId)).size > 1;
    if (fact.role === "line_total" && disagreedMoney.length > 1 && !sameMoney && !additiveShipments(disagreedMoney) && acrossDocuments) {
      return {
        sourceValue: disagreedMoney.map((part) => part.raw).slice(0, 3).join(" и "),
        discrepancy: null,
        status: "needs_review",
        severity: "medium",
        explanation: [{ code: "money_disagree", label: fact.label, parts: disagreedMoney.map((part) => `${part.raw} (${part.docName})`).join("; "), report: fact.raw }],
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
      explanation: [
        { code: "money_collected", net: Boolean(fact.net), parts: moneyParts.slice(0, 8).map((part) => `${part.raw} (${part.docName})`).join(", "), total: formatScaled(total, "₽") },
        ...(earlierDocuments(newer.older) ? [{ code: "newer_document" as const, earlier: earlierDocuments(newer.older) }] : []),
      ],
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
      explanation: [{ code: "report_vs_doc", report: fact.raw, document: primary.docName, source: primary.raw }],
      evidenceReferences: dates.map((source) => reference(source.documentId, source.fragment, source.raw)),
    };
  }
  return null;
}

export function toCheck(fact: Fact, sources: Fact[], reportFacts: Fact[], docs: { id: string; name: string; text: string; fragment: Fragment }[], index: number, unreadable: FileProblem[], partial: PreparedDoc[]): CheckResult {
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
      explanation: [{ code: "formula_blank", label: fact.label }],
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
        return matched(base, fact, exact.slice(0, 3), { code: "exact_text" });
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
        explanation: [{ code: "partial_read_value", label: fact.label, detail: why.join(" ") }],
        evidenceReferences: [],
      });
    }
    if (fact.role === "text" && fact.parsed.kind === "text" && fact.parsed.norm.length >= 4) {
      const norm = fact.parsed.norm;
      const hits = docs.filter((doc) => normText(doc.text).includes(norm));
      if (hits.length) {
        const evidence = hits.slice(0, 3).map((doc) => ({ ...fact, raw: fact.raw, docName: doc.name, docText: doc.text, documentId: doc.id, fragment: doc.fragment }));
        return matched(base, fact, evidence, { code: "text_seen", value: fact.raw, documents: hits.map((doc) => doc.name).slice(0, 3).join(", ") });
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
        explanation: [{ code: "damaged_field", document: relatedDamage[0]?.name ?? "", label: fact.label }],
        evidenceReferences: relatedDamage.slice(0, 2).map((doc) => reference(doc.id, doc.fragment, doc.text.slice(0, 180))),
      });
    }
    if (fact.role === "text") {
      return finish(base, {
        sourceValue: null,
        discrepancy: null,
        status: "needs_review",
        severity: "medium",
        explanation: [{ code: "needs_model", label: fact.label }],
        evidenceReferences: [],
      });
    }
    return finish(base, {
      sourceValue: null,
      discrepancy: null,
      status: "not_found",
      severity: fact.role === "line_total" || fact.role === "quantity" || fact.role === "transport" ? "high" : "medium",
      explanation: [{ code: "not_found_role", label: fact.label, value: fact.raw, ask: askRole(fact.role) }],
      evidenceReferences: [],
    });
  }

  if (fact.role === "item_name") {
    const listed = found.filter((source) => sameItem(fact.raw, source.raw));
    if (listed.length) return matched(base, fact, listed, { code: "item_listed", value: fact.raw });
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
      explanation: [{ code: "conflict", label: fact.label, parts: ordered.map((source) => `${source.raw} (${source.docName})`).join("; "), report: fact.raw }],
      evidenceReferences: ordered.map((source) => reference(source.documentId, source.fragment, source.raw)),
    });
  }

  const group = groups[0] ?? [];
  const same = valuesEqual(fact.parsed, group[0]?.parsed);
  const ordered = group.slice().sort((a, b) => rank(fact.role, a) - rank(fact.role, b));
  if (same) return matched(base, fact, ordered, { code: "source_confirms", label: fact.label });
  const primary = ordered[0];
  if (!primary) {
    return finish(base, {
      sourceValue: null,
      discrepancy: null,
      status: "not_found",
      severity: "medium",
      explanation: [{ code: "not_found", label: fact.label }],
      evidenceReferences: [],
    });
  }
  const delta = deltaOf(fact.parsed, primary.parsed);
  if (fact.parsed.kind === "money" && primary.parsed.kind === "money") {
    const tolerance = statedTolerance(`${fact.docText}\n${primary.docText}`);
    const gap = fact.parsed.minor - primary.parsed.minor;
    if (tolerance != null && gap <= tolerance && gap >= -tolerance) {
      return matched(base, fact, ordered, { code: "within_tolerance", label: fact.label });
    }
  }
  const mismatch = {
    sourceValue: primary.raw,
    discrepancy: delta,
    status: "mismatch" as const,
    severity: (fact.role === "line_total" || fact.role === "quantity" || fact.role === "transport" || fact.role === "unit_price" ? "high" : "medium") as Severity,
    explanation: [{ code: "mismatch_detail", report: fact.raw, document: primary.docName, source: primary.raw.replace(/\.$/, ""), label: fact.label, ...(delta ? { delta } : {}) } satisfies CheckNote],
    evidenceReferences: ordered.map((source) => reference(source.documentId, source.fragment, source.raw)),
  };
  const unit = unitOf(fact.parsed);
  return finish(base, unit ? { ...mismatch, unit } : mismatch);
}

export function matched(base: Omit<CheckResult, "sourceValue" | "discrepancy" | "status" | "severity" | "explanation" | "evidenceReferences">, fact: Fact, sources: Fact[], why: CheckNote): CheckResult {
  const primary = sources[0];
  return finish(base, {
    sourceValue: primary?.raw ?? fact.raw,
    discrepancy: null,
    status: "match",
    severity: "low",
    explanation: [why],
    evidenceReferences: sources.map((source) => reference(source.documentId, source.fragment, source.raw)),
  });
}

export function summed(base: Omit<CheckResult, "sourceValue" | "discrepancy" | "status" | "severity" | "explanation" | "evidenceReferences">, fact: Fact, sources: Fact[]): CheckResult {
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
    explanation: [{ code: "shipments_total", parts, total: formatScaled(total, unit === "₽" ? "₽" : unit), askMore: !same }],
    evidenceReferences: sources.map((source) => reference(source.documentId, source.fragment, source.raw, "слагаемое")),
  });
}

export function confirms(report: Fact, source: Fact): boolean {
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

export function sameRole(report: Fact, source: Fact): boolean {
  if (report.role === "transport") {
    return source.role === "transport" || (source.role === "line_total" && isTransportText(`${source.label} ${source.item ?? ""} ${source.raw}`));
  }
  return report.role === source.role;
}

export function needsItem(role: Role): boolean {
  return role === "quantity" || role === "line_total" || role === "unit_price" || role === "date" || role === "item_name";
}

export function canSum(role: Role, sources: Fact[]): boolean {
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

export function groupByValue(sources: Fact[]): Fact[][] {
  const groups = new Map<string, Fact[]>();
  for (const source of sources) {
    const key = valueKey(source.parsed);
    const list = groups.get(key) ?? [];
    list.push(source);
    groups.set(key, list);
  }
  return [...groups.values()];
}

export function valueKey(parsed: Parsed): string {
  if (parsed.kind === "money" || parsed.kind === "quantity") return `${parsed.kind}:${parsed.minor.toString()}`;
  if (parsed.kind === "date") return parsed.iso;
  if (parsed.kind === "id") return normalizeToken(parsed.token);
  if (parsed.kind === "text") return parsed.norm;
  return "missing";
}

export function valuesEqual(a: Parsed, b: Parsed | undefined): boolean {
  if (!b) return false;
  if (a.kind === "money" && b.kind === "money") return a.minor === b.minor;
  if (a.kind === "quantity" && b.kind === "quantity") return a.minor === b.minor && sameUnit(a.unit, b.unit);
  if (a.kind === "date" && b.kind === "date") return a.iso === b.iso;
  if (a.kind === "id" && b.kind === "id") return sameToken(a.token, b.token);
  if (a.kind === "text" && b.kind === "text") return a.norm === b.norm || similarText(a.norm, b.norm);
  return false;
}

export function deltaOf(report: Parsed, source: Parsed): string | null {
  if (report.kind === "money" && source.kind === "money") return formatSigned(report.minor - source.minor, "₽");
  if (report.kind === "quantity" && source.kind === "quantity") return formatSigned(report.minor - source.minor, report.unit);
  return null;
}

export function unitOf(parsed: Parsed): string | undefined {
  if (parsed.kind === "quantity") return parsed.unit;
  if (parsed.kind === "money") return "₽";
  return undefined;
}

export function rank(role: Role, fact: Fact): number {
  const order = prefer[role];
  const index = order.indexOf(fact.docKind);
  return index === -1 ? 99 : index;
}

export function uniqueRaws(facts: Fact[]): string[] {
  const out: string[] = [];
  for (const fact of facts) if (!out.includes(fact.raw)) out.push(fact.raw);
  return out;
}

export function askRole(role: Role): "transport" | "money" | "quantity" | "date" | "other" {
  if (role === "transport") return "transport";
  if (role === "line_total" || role === "unit_price") return "money";
  if (role === "quantity") return "quantity";
  if (role === "date") return "date";
  return "other";
}

export function reference(documentId: string, fragment: Fragment, quote: string, note?: string): EvidenceReference {
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

export function tighten(fragment: Fragment, value: string): Box | undefined {
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

export function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

export function finish(
  base: Omit<CheckResult, "sourceValue" | "discrepancy" | "status" | "severity" | "explanation" | "evidenceReferences" | "unit">,
  extra: {
    sourceValue: string | null;
    discrepancy: string | null;
    status: CheckStatus;
    severity: Severity;
    explanation: CheckNote[];
    evidenceReferences: EvidenceReference[];
    unit?: string;
  },
): CheckResult {
  const check: CheckResult = { ...base, ...extra };
  if (!extra.unit) delete check.unit;
  return check;
}

