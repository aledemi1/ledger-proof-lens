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
import { toCheck } from "./reconcile-assess";
import { buildFacts, noteModel, type FileProblem, type PreparedDoc, type RoleHints, type UnknownLabel } from "./reconcile-facts";

export type { FileProblem, PreparedDoc, RoleHints, UnknownLabel };

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

export function withoutDuplicates(report: PreparedDoc, supporting: PreparedDoc[]): { unique: PreparedDoc[]; duplicates: PreparedDoc[] } {
  const seen = new Set<string>([report.sha256, fingerprint(report.read.fragments.map((fragment) => fragment.text))]);
  const unique: PreparedDoc[] = [];
  const duplicates: PreparedDoc[] = [];
  for (const doc of supporting) {
    const fp = fingerprint(doc.read.fragments.map((fragment) => fragment.text));
    if (seen.has(doc.sha256) || (fp && seen.has(fp))) duplicates.push(doc);
    else {
      seen.add(doc.sha256);
      if (fp) seen.add(fp);
      unique.push(doc);
    }
  }
  return { unique, duplicates };
}

export function duplicateNames(report: PreparedDoc, supporting: PreparedDoc[]): string[] {
  return withoutDuplicates(report, supporting).duplicates.map((doc) => doc.name);
}

