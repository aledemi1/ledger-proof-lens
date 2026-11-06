import { detectRole, parseContractToken, parseDate, parseDecimal } from "./values";
import type { Fragment } from "./model";

export interface SheetCell {
  row: number;
  col: number;
  address: string;
  text: string;
  formulaMissing: boolean;
}

function isNumericish(text: string): boolean {
  const stripped = text.replace(/[₽]|руб\.?|rub/gi, "").trim();
  if (!stripped || /[A-Za-zА-Яа-я]{2,}/.test(stripped)) return false;
  return parseDecimal(stripped.replace(/\s/g, "")) != null;
}

function isKvRow(row: SheetCell[], next: SheetCell[] | undefined): boolean {
  if (row.length !== 2) return false;
  const left = row[0];
  const right = row[1];
  if (!left || !right || isNumericish(left.text)) return false;
  const leftRole = detectRole(left.text);
  const rightRole = detectRole(right.text);
  const nextHasNumber = next?.some((cell) => isNumericish(cell.text)) ?? false;
  if (leftRole && rightRole && !isNumericish(right.text) && !parseDate(right.text) && !parseContractToken(right.text) && nextHasNumber) {
    return false;
  }
  if (!leftRole && !isNumericish(right.text) && !parseDate(right.text) && !parseContractToken(right.text)) return false;
  return true;
}

function isHeaderRow(row: SheetCell[]): boolean {
  if (row.length < 2) return false;
  if (row.length === 2 && isKvRow(row, undefined)) return false;
  const labels = row.filter((cell) => !isNumericish(cell.text));
  if (labels.length < 2) return false;
  return labels.some((cell) => detectRole(cell.text));
}

function unitOf(row: SheetCell[], headers: Map<number, string>): string | undefined {
  for (const cell of row) {
    const header = headers.get(cell.col) ?? "";
    if (/^ед\.?$|^единиц/i.test(header.trim()) && cell.text.trim()) return cell.text.trim();
  }
  return undefined;
}

function itemOf(row: SheetCell[], headers: Map<number, string>): string | undefined {
  for (const cell of row) {
    const header = headers.get(cell.col) ?? "";
    if (detectRole(header) === "item_name" && cell.text.trim()) return cell.text.trim();
  }
  const first = row.find((cell) => !isNumericish(cell.text) && detectRole(headers.get(cell.col) ?? "") == null);
  return first?.text.trim() || undefined;
}

/** Turns a rectangular sheet or CSV grid into fragments and a preview grid. */
export function readGrid(
  sheetName: string,
  cells: SheetCell[],
  sheetIndex: number,
): { fragments: Fragment[]; rows: { index: number; cells: { anchor: string; text: string; address: string }[] }[] } {
  const byRow = new Map<number, SheetCell[]>();
  for (const cell of cells) {
    const list = byRow.get(cell.row) ?? [];
    list.push(cell);
    byRow.set(cell.row, list);
  }
  const rowNums = [...byRow.keys()].sort((a, b) => a - b);
  const fragments: Fragment[] = [];
  const previewRows: { index: number; cells: { anchor: string; text: string; address: string }[] }[] = [];
  let headers = new Map<number, string>();
  let inTable = false;

  const push = (cell: SheetCell, shape: Fragment["shape"], extra: Partial<Fragment> = {}) => {
    const anchor = `s${sheetIndex}r${cell.row}c${cell.col}`;
    const fragment: Fragment = {
      id: anchor,
      text: cell.text,
      pageNumber: 0,
      locationLabel: `Лист «${sheetName}», ячейка ${cell.address}`,
      anchor,
      shape,
      sheet: sheetName,
      cell: cell.address,
      ...extra,
    };
    if (cell.formulaMissing) fragment.formulaMissing = true;
    fragments.push(fragment);
    return anchor;
  };

  for (let i = 0; i < rowNums.length; i += 1) {
    const rowNum = rowNums[i] ?? 0;
    const row = (byRow.get(rowNum) ?? []).slice().sort((a, b) => a.col - b.col);
    const nextNum = rowNums[i + 1];
    const next = nextNum == null ? undefined : (byRow.get(nextNum) ?? []).slice().sort((a, b) => a.col - b.col);
    const preview = { index: rowNum, cells: [] as { anchor: string; text: string; address: string }[] };

    if (isHeaderRow(row) && !(inTable && headers.size > 0 && row.every((cell) => headers.has(cell.col)))) {
      headers = new Map(row.map((cell) => [cell.col, cell.text.trim()]));
      inTable = true;
      for (const cell of row) preview.cells.push({ anchor: push(cell, "title"), text: cell.text, address: cell.address });
    } else if (inTable && row.length >= 2 && !isKvRow(row, next)) {
      const item = itemOf(row, headers);
      const unit = unitOf(row, headers);
      for (const cell of row) {
        const header = headers.get(cell.col) ?? "";
        const role = detectRole(header);
        const shape = role && role !== "item_name" ? "table" : role === "item_name" ? "table" : "title";
        const extra: Partial<Fragment> = { columnHeader: header };
        if (item && role !== "item_name") extra.rowLabel = item;
        if (unit && role === "quantity") extra.unitHint = unit;
        preview.cells.push({ anchor: push(cell, shape, extra), text: cell.text, address: cell.address });
      }
    } else if (isKvRow(row, next)) {
      inTable = false;
      const left = row[0];
      const right = row[1];
      if (left) preview.cells.push({ anchor: push(left, "title"), text: left.text, address: left.address });
      if (right && left) {
        preview.cells.push({
          anchor: push(right, "kv", { label: left.text.trim() }),
          text: right.text,
          address: right.address,
        });
      }
    } else {
      if (row.length < 2) inTable = false;
      for (const cell of row) preview.cells.push({ anchor: push(cell, "title"), text: cell.text, address: cell.address });
    }
    if (preview.cells.length) previewRows.push(preview);
  }

  return { fragments, rows: previewRows };
}
