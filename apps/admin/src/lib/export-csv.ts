/** UTF-8 BOM + `;` separator for Greek Excel. */

const BOM = '\uFEFF';

function cell(value: string | number | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function eurosDot(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(cell).join(';')];
  for (const row of rows) lines.push(row.map(cell).join(';'));
  return BOM + lines.join('\r\n') + '\r\n';
}
