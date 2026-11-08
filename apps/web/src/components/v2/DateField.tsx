import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import './DateField.css';

export const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** YYYY-MM-DD → dd/mm/yyyy */
export function isoToDdMmYyyy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** dd/mm/yyyy (or d/m/yyyy) → YYYY-MM-DD, or '' if invalid. */
export function ddMmYyyyToIso(text: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return '';
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function todayIso(): string {
  const n = new Date();
  return toIso(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

/** Monday-first grid cells for a month (null = padding). */
export function monthCells(y: number, m: number): (number | null)[] {
  const first = new Date(Date.UTC(y, m - 1, 1));
  // getUTCDay: 0=Sun … → Monday-first offset
  const start = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (number | null)[] = Array(start).fill(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export type DateFieldProps = {
  id: string;
  label: string;
  value: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
  name?: string;
  fieldClass?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
  children?: ReactNode;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
};

export function DateField({
  id,
  label,
  value,
  onChange,
  name,
  fieldClass = 'f2',
  required,
  disabled,
  min,
  max,
  placeholder = 'dd/mm/yyyy',
  children,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: DateFieldProps) {
  const selected = parseIso(value);
  const [open, setOpen] = useState(false);
  const [viewY, setViewY] = useState(selected?.y ?? new Date().getFullYear());
  const [viewM, setViewM] = useState(selected?.m ?? new Date().getMonth() + 1);
  const root = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const popId = `${id}-cal-${reactId}`;
  const labelId = `${id}-label-${reactId}`;
  const display = isoToDdMmYyyy(value);
  const today = todayIso();

  useEffect(() => {
    if (!open) return;
    if (selected) {
      setViewY(selected.y);
      setViewM(selected.m);
    }
  }, [open, selected?.y, selected?.m]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const cells = useMemo(() => monthCells(viewY, viewM), [viewY, viewM]);

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(viewY, viewM - 1 + delta, 1));
    setViewY(d.getUTCFullYear());
    setViewM(d.getUTCMonth() + 1);
  };

  const pick = (day: number) => {
    const iso = toIso(viewY, viewM, day);
    if (min && iso < min) return;
    if (max && iso > max) return;
    onChange(iso);
    setOpen(false);
    document.getElementById(id)?.focus();
  };

  const disabledDay = (day: number) => {
    const iso = toIso(viewY, viewM, day);
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  };

  return (
    <div className={`${fieldClass} ep-date`.trim()} data-v2-extra ref={root}>
      <label id={labelId} htmlFor={id}>
        {label}
      </label>
      <button
        type="button"
        id={id}
        className="ep-date-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popId}
        aria-labelledby={labelId}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        data-empty={display ? '0' : '1'}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{display || placeholder}</span>
        <span className="sbebe0" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div
          id={popId}
          className="ep-cal"
          role="dialog"
          aria-label={label}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="ep-cal-head">
            <button
              type="button"
              className="ep-cal-nav"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
            >
              ‹
            </button>
            <div className="ep-cal-title">
              {MONTHS[viewM - 1]} {viewY}
            </div>
            <button
              type="button"
              className="ep-cal-nav"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
            >
              ›
            </button>
          </div>
          <div className="ep-cal-dow" aria-hidden="true">
            {DOW.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="ep-cal-grid" role="grid">
            {cells.map((day, i) =>
              day == null ? (
                <span key={`e-${i}`} />
              ) : (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  aria-selected={
                    selected?.y === viewY && selected?.m === viewM && selected?.d === day
                  }
                  data-today={toIso(viewY, viewM, day) === today ? '1' : undefined}
                  disabled={disabledDay(day)}
                  onClick={() => pick(day)}
                >
                  {day}
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      {children}
    </div>
  );
}
