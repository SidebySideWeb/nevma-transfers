/** Map a Postgres / PostgREST error to a staff-facing message. Never returns raw SQL. */

export type DbErrorLike = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
  constraint?: string;
};

export type MapDbErrorOpts = {
  /** Shown for check-constraint (23514) failures. */
  fieldValidationText?: string;
  /** Driver display name for bookings_no_driver_overlap (from the form / lookup). */
  driverName?: string | null;
  /** Booking reference that blocks the assignment (DR-02). */
  clashReference?: string | null;
};

const FALLBACK = 'That change could not be saved. Check the values and try again.';

const PREFIX_CODES = [
  'in_use',
  'has_future_bookings',
  'driver_inactive',
  'already_on_shift',
  'vehicle_in_use',
  'vehicle_unavailable',
  'no_shift',
  'invalid_transition',
  'statement_locked',
  'forbidden',
  'not_found',
  'invalid_request',
] as const;

const PREFIX_RE = new RegExp(
  `^(${PREFIX_CODES.join('|')}):\\s*(.+)$`,
  'i',
);
const EMBEDDED_RE = new RegExp(
  `\\b(${PREFIX_CODES.join('|')}):\\s*([^\\n]+)`,
  'i',
);

/**
 * @param fieldValidationTextOrOpts Shown when the DB raises 23514, or an options object.
 */
export function mapDbError(
  error: DbErrorLike | null | undefined,
  fieldValidationTextOrOpts?: string | MapDbErrorOpts,
): string {
  if (!error) return FALLBACK;
  const opts: MapDbErrorOpts =
    typeof fieldValidationTextOrOpts === 'string' || fieldValidationTextOrOpts === undefined
      ? { fieldValidationText: fieldValidationTextOrOpts }
      : fieldValidationTextOrOpts;

  const message = String(error.message ?? '');
  const code = String(error.code ?? '');
  const constraint = String(error.constraint ?? '');
  const haystack = `${message} ${error.details ?? ''} ${constraint}`.toLowerCase();

  const prefixed = message.match(PREFIX_RE);
  if (prefixed?.[2]) return prefixed[2].trim();

  const embedded = message.match(EMBEDDED_RE);
  if (embedded?.[2]) return embedded[2].trim();

  // Bare `forbidden` with no text after the colon.
  if (/^forbidden\b/i.test(message.trim()) || /\bforbidden\b/i.test(haystack) && code === 'P0001') {
    if (/^forbidden\s*$/i.test(message.trim()) || /^forbidden:\s*$/i.test(message.trim())) {
      return 'You are not allowed to do that.';
    }
  }

  if (code === '23505' && /vehicles_label_key|vehicles_label/.test(haystack)) {
    return 'That label is already used';
  }
  if (code === '23505' && /label/.test(haystack)) {
    return 'That label is already used';
  }

  if (code === '23514') {
    return opts.fieldValidationText?.trim() || 'That value is outside the allowed range.';
  }

  if (code === '23P01' || /exclusion|overlap/i.test(haystack)) {
    if (/bookings_no_driver_overlap/.test(haystack)) {
      const name = opts.driverName?.trim();
      const clash = opts.clashReference?.trim();
      const who = name ? `${name} is` : 'That driver is';
      return clash
        ? `${who} on ${clash} at that time`
        : `${who} on another booking at that time`;
    }
    if (/driver_shifts_driver_overlap/.test(haystack)) {
      return 'This driver already has a shift that overlaps that time.';
    }
    if (/driver_shifts_vehicle_overlap/.test(haystack)) {
      return 'That vehicle is already on a shift that overlaps that time.';
    }
    if (/driver_pay_plans_no_overlap/.test(haystack)) {
      return 'This pay plan overlaps another plan for the same driver.';
    }
    if (/driver_statements_no_overlap/.test(haystack)) {
      return 'This statement period overlaps another statement for the same driver.';
    }
  }

  if (/duplicate key|unique constraint/i.test(message) && /label/i.test(haystack)) {
    return 'That label is already used';
  }

  return FALLBACK;
}
