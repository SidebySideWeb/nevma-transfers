import ExcelJS from 'exceljs';

export type ExcelColumn = {
  header: string;
  width?: number;
  /** number | date | text */
  type?: 'number' | 'date' | 'text';
  /** Applied to number cells (euros). */
  numFmt?: string;
};

export type ExcelRow = (string | number | Date | null | undefined)[];

const EUR_FMT = '#,##0.00 "€"';

export async function buildWorkbook(opts: {
  sheetName: string;
  columns: ExcelColumn[];
  rows: ExcelRow[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const name = opts.sheetName.slice(0, 31) || 'Report';
  const ws = wb.addWorksheet(name);
  ws.columns = opts.columns.map((c) => ({
    header: c.header,
    width: c.width ?? 14,
  }));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const row of opts.rows) {
    const values = row.map((v) => (v === undefined ? null : v));
    const r = ws.addRow(values);
    opts.columns.forEach((col, i) => {
      const cell = r.getCell(i + 1);
      if (col.type === 'number' && typeof values[i] === 'number') {
        cell.numFmt = col.numFmt ?? EUR_FMT;
      } else if (col.type === 'date' && values[i] instanceof Date) {
        cell.numFmt = 'yyyy-mm-dd';
      }
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function readAmountAndDateCells(buffer: Buffer): Promise<{
  amounts: number[];
  dates: Date[];
}> {
  const wb = new ExcelJS.Workbook();
  // exceljs Buffer typings disagree with Node 22 Buffer; load accepts ArrayBuffer-like.
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0]!;
  const amounts: number[] = [];
  const dates: Date[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      if (typeof cell.value === 'number') amounts.push(cell.value);
      if (cell.value instanceof Date) dates.push(cell.value);
      if (cell.type === ExcelJS.ValueType.Date && typeof cell.value === 'object' && cell.value && 'result' in (cell.value as object)) {
        /* formula date — ignore */
      }
    });
  });
  return { amounts, dates };
}
