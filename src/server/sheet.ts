import { detectRole, headerWord, parseContractToken, parseDate, parseDecimal, parseMoney, parseQuantity, productCodes } from "./values";
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
  const label = row.find((cell) => headerWord.indicator.test(cell.text) && !headerWord.value.test(cell.text));
  const value = row.find((cell) => headerWord.value.test(cell.text));
  if (!label || !value) return null;
  const unit = row.find((cell) => headerWord.unit.test(cell.text.trim()));
  return unit ? { label: label.col, value: value.col, unit: unit.col } : { label: label.col, value: value.col };
}

function isHeaderRow(row: SheetCell[]): boolean {
  if (row.length < 2) return false;
  if (row.some((cell) => isNumericish(cell.text) || parseDate(cell.text) != null)) return false;
  if (indicatorColumns(row)) return true;
  if (row.length === 2 && isKvRow(row, undefined)) return false;
  const labels = row.filter((cell) => !isNumericish(cell.text));
  if (labels.length < 2) return false;
  if (labels.some((cell) => /участник|фио|слушател|participant|attendee|teilnehmer|partecipant|uczestnik|deelnemer|katılımcı|katilimci|姓名/i.test(cell.text))) return true;
  return labels.some((cell) => detectRole(cell.text));
}

function unitOf(row: SheetCell[], headers: Map<number, string>): string | undefined {
  for (const cell of row) {
    const header = headers.get(cell.col) ?? "";
    if (headerWord.unit.test(header.trim()) && cell.text.trim()) return cell.text.trim();
  }
  return undefined;
}

function itemOf(row: SheetCell[], headers: Map<number, string>): string | undefined {
  let name = "";
  for (const cell of row) {
    const header = headers.get(cell.col) ?? "";
    if ((headerWord.item.test(header) || headerWord.indicator.test(header)) && cell.text.trim()) {
      name = cell.text.trim();
      break;
    }
    if (detectRole(header) === "item_name" && cell.text.trim()) {
      name = cell.text.trim();
      break;
    }
  }
  if (!name) {
    const numberCell = row.find((cell) => /№|номер|number|nr\.?|n[oº]|numéro|numero|ordine|pedido|sipariş|siparis|polecen|opdracht|ordem|ödeme|odeme/i.test(headers.get(cell.col) ?? "") && cell.text.trim());
    if (numberCell && !row.some((cell) => headerWord.item.test(headers.get(cell.col) ?? ""))) name = `№ ${numberCell.text.trim()}`;
  }
  if (!name) {
    const first = row.find((cell) => !isNumericish(cell.text) && detectRole(headers.get(cell.col) ?? "") == null);
    name = first?.text.trim() ?? "";
  }
  if (!name) return undefined;
  const codeCell = row.find((cell) => headerWord.code.test(headers.get(cell.col) ?? "") && cell.text.trim());
  const code = codeCell ? productCodes(codeCell.text).join(" ") : "";
  return code && !name.toUpperCase().includes(code) ? `${name} ${code}` : name;
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
        const quantityColumn = role === "quantity" || headerWord.qty.test(header);
        const bareUnit = row.find((cell) => /^(шт\.?|компл\.?|набор\w*|час\.?|месяц\w*|человек|чел\.?|persons?|personas|persone|personnes|os[oó]b\w*|personen|menschen|personne|kişi|усл\.?|мг|pcs\.?|pieces?|hours?|months?|service|stk\.?|szt\.?|件|个)$/i.test(cell.text.trim()));
        if (quantityColumn && unit) extra.unitHint = unit;
        else if (quantityColumn && /^часы?$|^hours?$/i.test(header)) extra.unitHint = "час";
        else if (quantityColumn && bareUnit) extra.unitHint = bareUnit.text.trim();
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
