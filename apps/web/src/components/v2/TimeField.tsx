import { BrandDropdown } from './BrandDropdown';
import './TimeField.css';

/** 12-hour clock face values with :00 / :30 — short list + AM/PM. */
export const HOUR12_OPTIONS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [];
  for (const h of [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    for (const m of [0, 30]) {
      const mm = String(m).padStart(2, '0');
      const label = `${h}:${mm}`;
      out.push({ value: label, label });
    }
  }
  return out;
})();

export const PERIOD_OPTIONS = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
] as const;

export type Period = 'AM' | 'PM';

/** Snap HH:mm (24h) to nearest :00 / :30 and split into 12h + period. */
export function splitTime12(hhmm: string): { hour12: string; period: Period } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return { hour12: '12:00', period: 'PM' };
  let h = Number(m[1]);
  let min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return { hour12: '12:00', period: 'PM' };
  h = ((h % 24) + 24) % 24;
  min = min < 15 ? 0 : min < 45 ? 30 : 0;
  if (min === 0 && Number(m[2]) >= 45) h = (h + 1) % 24;
  const period: Period = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return { hour12: `${h12}:${String(min).padStart(2, '0')}`, period };
}

/** Combine 12h face + AM/PM → HH:mm (24h). */
export function joinTime12(hour12: string, period: Period): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hour12.trim());
  if (!m) return '12:00';
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || h < 1 || h > 12) h = 12;
  const mm = min === 30 ? 30 : 0;
  if (period === 'AM') {
    h = h === 12 ? 0 : h;
  } else {
    h = h === 12 ? 12 : h + 12;
  }
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export type TimeFieldProps = {
  id: string;
  label: string;
  value: string; // HH:mm 24h
  onChange: (hhmm: string) => void;
  hint?: string;
  fieldClass?: string;
  error?: string | null;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
};

/** Hour (12h :00/:30) + AM/PM — shorter than a full 24×5-minute list. */
export function TimeField({
  id,
  label,
  value,
  onChange,
  hint,
  fieldClass = 'field ep-time',
  error,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: TimeFieldProps) {
  const { hour12, period } = splitTime12(value || '12:00');
  const described =
    [ariaDescribedBy, hint ? `${id}-hint` : null, error ? `${id}-err` : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className={`${fieldClass} ep-time-field`.trim()} data-v2-extra>
      <span className="ep-time-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="ep-time-row" role="group" aria-labelledby={`${id}-label`}>
        <BrandDropdown
          id={`${id}-hour`}
          label="Hour"
          options={HOUR12_OPTIONS}
          value={HOUR12_OPTIONS.some((o) => o.value === hour12) ? hour12 : '12:00'}
          onChange={(h) => onChange(joinTime12(h, period))}
          fieldClass="field ep-time-hour"
          hideLabel
          error={error ? '' : null}
          aria-invalid={ariaInvalid}
          aria-describedby={described}
        />
        <BrandDropdown
          id={`${id}-period`}
          label="AM/PM"
          options={[...PERIOD_OPTIONS]}
          value={period}
          onChange={(p) => onChange(joinTime12(hour12, p as Period))}
          fieldClass="field ep-time-period"
          hideLabel
          aria-invalid={ariaInvalid}
          aria-describedby={described}
        />
      </div>
      {hint ? (
        <span className="js-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="error" id={`${id}-err`}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
