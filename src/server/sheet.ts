import { detectRole, parseContractToken, parseDate, parseDecimal, parseMoney, parseQuantity } from "./values";
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

function looksLikeValue(text: string): boolean {
  return isNumericish(text) || parseDate(text) != null || parseQuantity(text) != null || parseMoney(text) != null;
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
  if (!leftRole && !looksLikeValue(right.text) && !parseContractToken(right.text)) return false;
  return true;
}

function indicatorColumns(row: SheetCell[]): { label: number; value: number; unit?: number } | null {
  const label = row.find((cell) => /показател/i.test(cell.text) && !/значен/i.test(cell.text));
  const value = row.find((cell) => /значен/i.test(cell.text));
  if (!label || !value) return null;
  const unit = row.find((cell) => /^(ед\.?|единица)\b/i.test(cell.text.trim()));
  return unit ? { label: label.col, value: value.col, unit: unit.col } : { label: label.col, value: value.col };
}

function isHeaderRow(row: SheetCell[]): boolean {
  if (row.length < 2) return false;
  if (row.some((cell) => isNumericish(cell.text) || parseDate(cell.text) != null)) return false;
  if (indicatorColumns(row)) return true;
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
    if (/наименован|вид\s+работ|показател/i.test(header) && cell.text.trim()) return cell.text.trim();
    if (detectRole(header) === "item_name" && cell.text.trim()) return cell.text.trim();
  }
  const numberCell = row.find((cell) => /№|номер/i.test(headers.get(cell.col) ?? "") && cell.text.trim());
  if (numberCell && !row.some((cell) => /наименован/i.test(headers.get(cell.col) ?? ""))) return `№ ${numberCell.text.trim()}`;
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
  let indicator: { label: number; value: number; unit?: number } | null = null;

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

    const indicatorHeader = indicatorColumns(row);
    const columns = indicator;
    if (indicatorHeader && isHeaderRow(row)) {
      indicator = indicatorHeader;
      inTable = false;
      headers = new Map();
      for (const cell of row) preview.cells.push({ anchor: push(cell, "title"), text: cell.text, address: cell.address });
    } else if (columns && row.some((cell) => cell.col === columns.label) && row.some((cell) => cell.col === columns.value)) {
      const labelCell = row.find((cell) => cell.col === columns.label);
      const valueCell = row.find((cell) => cell.col === columns.value);
      const unitCell = columns.unit == null ? undefined : row.find((cell) => cell.col === columns.unit);
      for (const cell of row) {
        const extra: Partial<Fragment> = {};
        if (cell === valueCell && labelCell) {
          extra.label = labelCell.text.trim();
          if (unitCell?.text.trim()) extra.unitHint = unitCell.text.trim();
        }
        preview.cells.push({ anchor: push(cell, cell === valueCell ? "kv" : "title", extra), text: cell.text, address: cell.address });
      }
    } else if (isHeaderRow(row) && !(inTable && headers.size > 0 && row.every((cell) => headers.has(cell.col)))) {
      indicator = null;
      headers = new Map(row.map((cell) => [cell.col, cell.text.trim()]));
      inTable = true;
      for (const cell of row) preview.cells.push({ anchor: push(cell, "title"), text: cell.text, address: cell.address });
    } else if (inTable && row.length >= 2 && !isKvRow(row, next)) {
      const item = itemOf(row, headers);
      const unit = unitOf(row, headers);
      for (const cell of row) {
        const header = headers.get(cell.col) ?? "";
        const role = detectRole(header);
        const shape = role || (header && looksLikeValue(cell.text)) ? "table" : "title";
        const extra: Partial<Fragment> = { columnHeader: header };
        if (item && role !== "item_name") extra.rowLabel = item;
        const quantityColumn = role === "quantity" || /кол-?во|количество|объем|объём|принято|получено/i.test(header);
        if (unit && quantityColumn) extra.unitHint = unit;
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
