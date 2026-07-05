import ExcelJS from 'exceljs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CAPACITY = 31;
const MAX_TEMPLATE_PAGES = 12;
const SLOT_ROWS = Array.from({ length: CAPACITY }, (_, index) => 8 + index * 3);
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const templatePath = resolve(root, 'assets/excel/order-details-template.xlsx');

function monthKeys(start, end) {
  const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  const last = new Date(`${end.slice(0, 7)}-01T00:00:00Z`);
  const keys = [];
  while (cursor <= last) {
    keys.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

function chunks(items, size) {
  if (!items.length) return [[]];
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function sheetName(base, page, pages) {
  const suffix = pages > 1 ? `_${page + 1}` : '';
  return `${base}${suffix}`.slice(0, 31);
}

function segmentsFor(projects, start, end, grouping) {
  if (grouping === 'monthly_sheets') {
    return monthKeys(start, end).flatMap((month) => {
      const pages = chunks(projects.filter((project) => String(project.start_date ?? '').startsWith(month)), CAPACITY);
      return pages.map((items, page) => ({ name: sheetName(month, page, pages.length), items, month }));
    });
  }
  const base = grouping === 'single_month' ? start.slice(0, 7) : `${start.slice(0, 7)}_${end.slice(0, 7)}`;
  const pages = chunks(projects, CAPACITY);
  return pages.map((items, page) => ({ name: sheetName(base, page, pages.length), items, month: start.slice(0, 7) }));
}

function japaneseEraMonth(value) {
  if (!value) return null;
  const [year, month] = String(value).split('-').map(Number);
  if (!year || !month) return String(value);
  if (year >= 2019) return `R${year - 2018}.${month}`;
  if (year >= 1989) return `H${year - 1988}.${month}`;
  return `${year}.${month}`;
}

function monthLabel(month, offset) {
  const value = new Date(`${month}-01T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + offset);
  return `${value.getUTCMonth() + 1}月${offset === 3 ? '以降' : ''}`;
}

function populateSheet(sheet, segment, exportedAt) {
  sheet.pageSetup = {
    ...sheet.pageSetup,
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 2,
    printArea: 'A1:W104',
  };
  sheet.getCell('I3').value = exportedAt;
  ['O7', 'Q7', 'S7', 'U7'].forEach((cell, index) => { sheet.getCell(cell).value = monthLabel(segment.month, index); });
  SLOT_ROWS.forEach((row) => {
    for (let currentRow = row; currentRow <= row + 2; currentRow += 1) {
      for (const column of [1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13, 15, 17, 19, 21]) sheet.getCell(currentRow, column).value = null;
    }
  });
  segment.items.forEach((project, index) => {
    const row = SLOT_ROWS[index];
    sheet.getCell(`A${row}`).value = project.customer_name ?? '';
    sheet.getCell(`B${row}`).value = project.construction_name ?? '';
    sheet.getCell(`E${row}`).value = japaneseEraMonth(project.start_date);
    sheet.getCell(`E${row + 2}`).value = japaneseEraMonth(project.due_date);
    sheet.getCell(`F${row}`).value = Number(project.budget_total ?? 0);
  });
}

export async function buildOrderDetailsWorkbook({ projects, start, end, grouping, exportedAt = new Date() }) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const segments = segmentsFor(projects, start, end, grouping);
  const templateSheets = workbook.worksheets;
  if (templateSheets.length < MAX_TEMPLATE_PAGES || segments.length > templateSheets.length) throw new Error(`Excel出力上限（${CAPACITY * templateSheets.length}件）を超えています`);
  const outputSheets = templateSheets.slice(0, segments.length);
  templateSheets.slice(segments.length).forEach((sheet) => workbook.removeWorksheet(sheet.id));
  outputSheets.forEach((sheet, index) => { sheet.name = segments[index].name; });
  outputSheets.forEach((sheet, index) => populateSheet(sheet, segments[index], exportedAt));
  workbook.calcProperties.fullCalcOnLoad = true;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export { CAPACITY, MAX_TEMPLATE_PAGES, segmentsFor };
