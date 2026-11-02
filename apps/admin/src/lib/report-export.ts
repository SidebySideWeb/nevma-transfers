import { eurosDot, toCsv } from './export-csv';
import { buildWorkbook, type ExcelColumn, type ExcelRow } from './export-excel';
import { eurosNumber } from './pay-format';
import { periodFileStamp } from './report-period';

export type ReportTab = 'pay' | 'vehicles' | 'bookings';

export type DriverPayRow = {
  driver_id: string;
  full_name: string;
  jobs: number;
  days_worked: number;
  shift_hours: number;
  total_cents: number;
  statement_status: string | null;
};

export type VehicleUsageRow = {
  vehicle_id: string;
  label: string;
  class_name: string;
  jobs: number;
  booked_hours: number;
  shift_days: number;
  shift_hours: number;
};

export type BookingsDayRow = {
  day: string;
  completed: number;
  no_show: number;
  cancelled: number;
  revenue_cents: number;
  online: number;
  office: number;
};

export function reportFileBase(tab: ReportTab, from: string, to: string): string {
  const name = tab === 'pay' ? 'driver-pay' : tab === 'vehicles' ? 'vehicles' : 'bookings-per-day';
  return `${name}_${periodFileStamp(from, to)}`;
}

export function driverPayCsv(rows: DriverPayRow[]): string {
  return toCsv(
    ['Driver', 'Jobs', 'Days', 'Shift hours', 'Owed (cents)', 'Amount (EUR)', 'Statement'],
    rows.map((r) => [
      r.full_name,
      r.jobs,
      r.days_worked,
      r.shift_hours,
      r.total_cents,
      eurosDot(r.total_cents),
      r.statement_status ?? '',
    ]),
  );
}

export function vehicleUsageCsv(rows: VehicleUsageRow[]): string {
  return toCsv(
    ['Vehicle', 'Class', 'Jobs', 'Booked hours', 'Shift days', 'Shift hours'],
    rows.map((r) => [r.label, r.class_name, r.jobs, r.booked_hours, r.shift_days, r.shift_hours]),
  );
}

export function bookingsDayCsv(rows: BookingsDayRow[]): string {
  return toCsv(
    ['Day', 'Completed', 'No-show', 'Cancelled', 'Revenue (cents)', 'Amount (EUR)', 'Online', 'Office'],
    rows.map((r) => [
      r.day,
      r.completed,
      r.no_show,
      r.cancelled,
      r.revenue_cents,
      eurosDot(r.revenue_cents),
      r.online,
      r.office,
    ]),
  );
}

export async function driverPayExcel(rows: DriverPayRow[], from: string, to: string): Promise<Buffer> {
  const columns: ExcelColumn[] = [
    { header: 'Driver', type: 'text', width: 22 },
    { header: 'Jobs', type: 'number', width: 10, numFmt: '0' },
    { header: 'Days', type: 'number', width: 10, numFmt: '0' },
    { header: 'Shift hours', type: 'number', width: 12, numFmt: '0.00' },
    { header: 'Owed', type: 'number', width: 14 },
    { header: 'Statement', type: 'text', width: 12 },
  ];
  const excelRows: ExcelRow[] = rows.map((r) => [
    r.full_name,
    r.jobs,
    r.days_worked,
    Number(r.shift_hours),
    eurosNumber(r.total_cents),
    r.statement_status ?? '',
  ]);
  return buildWorkbook({
    sheetName: `Driver pay ${from}_${to}`.slice(0, 31),
    columns,
    rows: excelRows,
  });
}

export async function vehicleUsageExcel(
  rows: VehicleUsageRow[],
  from: string,
  to: string,
): Promise<Buffer> {
  const columns: ExcelColumn[] = [
    { header: 'Vehicle', type: 'text', width: 16 },
    { header: 'Class', type: 'text', width: 16 },
    { header: 'Jobs', type: 'number', width: 10, numFmt: '0' },
    { header: 'Booked hours', type: 'number', width: 12, numFmt: '0.00' },
    { header: 'Shift days', type: 'number', width: 10, numFmt: '0' },
    { header: 'Shift hours', type: 'number', width: 12, numFmt: '0.00' },
  ];
  const excelRows: ExcelRow[] = rows.map((r) => [
    r.label,
    r.class_name,
    r.jobs,
    Number(r.booked_hours),
    r.shift_days,
    Number(r.shift_hours),
  ]);
  return buildWorkbook({
    sheetName: `Vehicles ${from}_${to}`.slice(0, 31),
    columns,
    rows: excelRows,
  });
}

export async function bookingsDayExcel(rows: BookingsDayRow[], from: string, to: string): Promise<Buffer> {
  const columns: ExcelColumn[] = [
    { header: 'Day', type: 'date', width: 12 },
    { header: 'Completed', type: 'number', width: 10, numFmt: '0' },
    { header: 'No-show', type: 'number', width: 10, numFmt: '0' },
    { header: 'Cancelled', type: 'number', width: 10, numFmt: '0' },
    { header: 'Revenue', type: 'number', width: 14 },
    { header: 'Online', type: 'number', width: 10, numFmt: '0' },
    { header: 'Office', type: 'number', width: 10, numFmt: '0' },
  ];
  const excelRows: ExcelRow[] = rows.map((r) => {
    const [y, m, d] = r.day.split('-').map(Number);
    return [
      new Date(Date.UTC(y!, m! - 1, d!)),
      r.completed,
      r.no_show,
      r.cancelled,
      eurosNumber(r.revenue_cents),
      r.online,
      r.office,
    ];
  });
  return buildWorkbook({
    sheetName: `Bookings ${from}_${to}`.slice(0, 31),
    columns,
    rows: excelRows,
  });
}

export type StatementLine = {
  kind: string;
  on_date: string;
  reference: string | null;
  description: string;
  quantity: number;
  rate_cents: number | null;
  amount_cents: number;
};

export async function statementExcel(
  lines: StatementLine[],
  driverName: string,
  from: string,
  to: string,
): Promise<Buffer> {
  const columns: ExcelColumn[] = [
    { header: 'Kind', type: 'text', width: 12 },
    { header: 'Date', type: 'date', width: 12 },
    { header: 'Booking', type: 'text', width: 14 },
    { header: 'Description', type: 'text', width: 36 },
    { header: 'Qty', type: 'number', width: 10, numFmt: '0.00' },
    { header: 'Rate', type: 'number', width: 12 },
    { header: 'Amount', type: 'number', width: 12 },
  ];
  const excelRows: ExcelRow[] = lines.map((l) => {
    const [y, m, d] = l.on_date.split('-').map(Number);
    return [
      l.kind,
      new Date(Date.UTC(y!, m! - 1, d!)),
      l.reference ?? '',
      l.description,
      Number(l.quantity),
      l.rate_cents == null ? null : eurosNumber(l.rate_cents),
      eurosNumber(l.amount_cents),
    ];
  });
  return buildWorkbook({
    sheetName: `${driverName} ${from}_${to}`.slice(0, 31),
    columns,
    rows: excelRows,
  });
}
