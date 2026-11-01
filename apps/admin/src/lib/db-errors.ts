/** Map a Postgres / PostgREST error to a staff-facing message. Never returns raw SQL. */

export type DbErrorLike = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
  constraint?: string;
};

const FALLBACK = 'That change could not be saved. Check the values and try again.';

/**
 * @param fieldValidationText Shown when the DB raises 23514 (check constraint),
 *   for example a field's own help text. When omitted, a generic message is used.
 */
export function mapDbError(
  error: DbErrorLike | null | undefined,
  fieldValidationText?: string,
): string {
  if (!error) return FALLBACK;
  const message = String(error.message ?? '');
  const code = String(error.code ?? '');
  const constraint = String(error.constraint ?? '');
  const haystack = `${message} ${error.details ?? ''} ${constraint}`.toLowerCase();

  const prefixed = message.match(/^(in_use|has_future_bookings):\s*(.+)$/i);
  if (prefixed?.[2]) return prefixed[2].trim();

  // PostgREST often wraps: "in_use: …" inside a longer string.
  const embedded = message.match(/\b(in_use|has_future_bookings):\s*([^\n]+)/i);
  if (embedded?.[2]) return embedded[2].trim();

  if (code === '23505' && /vehicles_label_key|vehicles_label/.test(haystack)) {
    return 'That label is already used';
  }
  if (code === '23505' && /label/.test(haystack)) {
    return 'That label is already used';
  }

  if (code === '23514') {
    return fieldValidationText?.trim() || 'That value is outside the allowed range.';
  }

  if (/duplicate key|unique constraint/i.test(message) && /label/i.test(haystack)) {
    return 'That label is already used';
  }

  return FALLBACK;
}
