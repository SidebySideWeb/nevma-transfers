import { BrandDropdown } from './BrandDropdown';
import './TimeField.css';

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

function label12(hhmm: string): string {
  const { hour, minute, period } = splitTime12(hhmm);
  return `${hour}:${minute} ${period}`;
}

/** Every :00 / :30 in 24h values, shown as 12h + AM/PM (one list, one field). */
export const TIME_OPTIONS: { value: string; label: string }[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? '00' : '30';
  const value = `${String(h).padStart(2, '0')}:${m}`;
  return { value, label: label12(value) };
});

/** Kept for tests / callers that still split the clock face. */
export const HOUR_OPTIONS: { value: string; label: string }[] = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(
  (h) => ({ value: String(h), label: String(h) }),
);

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
  /** An empty `value` shows a blank list until the customer picks a time. */
  allowEmpty?: boolean;
};

/** Single brand dropdown of half-hour times (same field pattern as DateField / zones). */
export function TimeField({
  id,
  label,
  value,
  allowEmpty = false,
  onChange,
  hint,
  fieldClass = 'field ep-time',
  error,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: TimeFieldProps) {
  const snapped = value ? splitTime12(value) : null;
  const selected = snapped ? joinTime12(snapped.hour, snapped.minute, snapped.period) : '';
  const options = allowEmpty ? [{ value: '', label: '' }, ...TIME_OPTIONS] : TIME_OPTIONS;
  const described =
    [ariaDescribedBy, hint ? `${id}-hint` : null, error ? `${id}-err` : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className={`${fieldClass} ep-time-field`.trim()} data-v2-extra>
      <BrandDropdown
        id={id}
        label={label}
        options={options}
        value={allowEmpty && !value ? '' : selected || TIME_OPTIONS[24]?.value || '12:00'}
        onChange={onChange}
        fieldClass="field ep-time-select"
        error={error ? '' : null}
        aria-invalid={ariaInvalid}
        aria-describedby={described}
      />
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
