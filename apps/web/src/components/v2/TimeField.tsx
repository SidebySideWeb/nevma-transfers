import { BrandDropdown } from './BrandDropdown';
import './TimeField.css';

/** Clock hours 1–12 only — keep the open list short; minutes and AM/PM are separate. */
export const HOUR_OPTIONS: { value: string; label: string }[] = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(
  (h) => ({ value: String(h), label: String(h) }),
);

export const MINUTE_OPTIONS = [
  { value: '00', label: '00' },
  { value: '30', label: '30' },
] as const;

export const PERIOD_OPTIONS = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
] as const;

export type Period = 'AM' | 'PM';

export type Time12Parts = { hour: string; minute: string; period: Period };

/** Snap HH:mm (24h) to nearest :00 / :30 and split into hour + minute + AM/PM. */
export function splitTime12(hhmm: string): Time12Parts {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return { hour: '12', minute: '00', period: 'PM' };
  let h = Number(m[1]);
  let min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return { hour: '12', minute: '00', period: 'PM' };
  h = ((h % 24) + 24) % 24;
  min = min < 15 ? 0 : min < 45 ? 30 : 0;
  if (min === 0 && Number(m[2]) >= 45) h = (h + 1) % 24;
  const period: Period = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return { hour: String(h12), minute: String(min).padStart(2, '0'), period };
}

/** Combine hour + minute + AM/PM → HH:mm (24h). */
export function joinTime12(hour: string, minute: string, period: Period): string {
  let h = Number(hour);
  if (!Number.isFinite(h) || h < 1 || h > 12) h = 12;
  const mm = minute === '30' ? 30 : 0;
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

/** Hour (1–12) + minutes (:00/:30) + AM/PM — three short lists. */
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
  const { hour, minute, period } = splitTime12(value || '12:00');
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
          options={HOUR_OPTIONS}
          value={HOUR_OPTIONS.some((o) => o.value === hour) ? hour : '12'}
          onChange={(h) => onChange(joinTime12(h, minute, period))}
          fieldClass="field ep-time-hour"
          hideLabel
          error={error ? '' : null}
          aria-invalid={ariaInvalid}
          aria-describedby={described}
        />
        <BrandDropdown
          id={`${id}-min`}
          label="Minutes"
          options={[...MINUTE_OPTIONS]}
          value={minute === '30' ? '30' : '00'}
          onChange={(mm) => onChange(joinTime12(hour, mm, period))}
          fieldClass="field ep-time-min"
          hideLabel
          aria-invalid={ariaInvalid}
          aria-describedby={described}
        />
        <BrandDropdown
          id={`${id}-period`}
          label="AM/PM"
          options={[...PERIOD_OPTIONS]}
          value={period}
          onChange={(p) => onChange(joinTime12(hour, minute, p as Period))}
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
