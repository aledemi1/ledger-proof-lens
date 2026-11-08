import type { CheckResult } from "@/types/audit";

export interface IssueGroup {
  key: string;
  title: string;
  primary: CheckResult;
  related: CheckResult[];
}

const MONEY = /цена|тариф|ндс|сумм|стоим/i;

function splitName(fieldName: string): { item: string; aspect: string } {
  const parts = fieldName.split(" — ");
  if (parts.length < 2) return { item: fieldName, aspect: "" };
  return { item: parts.slice(0, -1).join(" — "), aspect: parts[parts.length - 1] ?? "" };
}

/** A remark name that keeps the position even when the column title repeats. */
export function checkTitle(check: CheckResult): string {
  const { item, aspect } = splitName(check.fieldName);
  if (!aspect) {
    if (/наименован/i.test(item) && check.reportValue.trim() && check.reportValue.trim() !== item) {
      return `${check.reportValue.trim()} — наименование`;
    }
    return item;
  }
  const tail = aspect.charAt(0).toLowerCase() + aspect.slice(1);
  return `${item} — ${tail}`;
}

function positionKey(check: CheckResult): string {
  const { item, aspect } = splitName(check.fieldName);
  if (aspect && item.trim()) return item.trim();
  if (/наименован/i.test(check.fieldName) && check.reportValue.trim()) return check.reportValue.trim();
  return check.fieldName;
}

function rank(check: CheckResult): number {
  const aspect = splitName(check.fieldName).aspect;
  if (/цена|тариф/i.test(aspect)) return 0;
  if (check.status === "mismatch") return 1;
  if (check.status === "not_found") return 2;
  return 3;
}

/** One card per position. Price, net and gross of the same row stay together. */
export function groupIssues(issues: CheckResult[]): IssueGroup[] {
  const buckets = new Map<string, CheckResult[]>();
  for (const check of issues) {
    const key = positionKey(check);
    const list = buckets.get(key) ?? [];
    list.push(check);
    buckets.set(key, list);
  }
  const groups: IssueGroup[] = [];
  for (const [key, list] of buckets) {
    const ordered = list.slice().sort((a, b) => rank(a) - rank(b));
    const primary = ordered[0];
    if (!primary) continue;
    const money = ordered.filter((check) => MONEY.test(`${splitName(check.fieldName).aspect} ${check.fieldName}`));
    const related = money.length >= 2 ? ordered.filter((check) => check.id !== primary.id) : ordered.slice(1);
    groups.push({ key, title: checkTitle(primary), primary, related });
  }
  return groups;
}

export function groupMatches(group: IssueGroup, query: string): boolean {
  const haystack = [group.title, group.primary.fieldName, group.primary.reportValue, ...group.related.map((check) => check.fieldName)]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}
