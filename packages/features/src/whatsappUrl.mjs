/**
 * Free WhatsApp click-to-chat links (`wa.me`). No API, no Meta account.
 * Prefill never includes name, address, phone or price.
 */

const NUMBER_RE = /^[1-9]\d{7,14}$/;

/**
 * Strip to international digits. Greek mobiles without a country code become `30…`.
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function whatsappDigits(raw) {
  if (raw == null) return null;
  let d = String(raw).replace(/\D+/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  // Greek national: 10 digits starting with 2 or 6 → prepend 30
  if (d.length === 10 && /^[26]/.test(d)) d = `30${d}`;
  // Leading 0 then 9 national digits
  if (d.length === 11 && d.startsWith('0')) d = `30${d.slice(1)}`;
  return NUMBER_RE.test(d) ? d : null;
}

/**
 * Format pick-up for the prefilled message: "23 Nov, 18:34" in Europe/Athens.
 * @param {string|Date|null|undefined} pickupAt
 * @returns {string|null}
 */
export function formatWhatsappPickup(pickupAt) {
  if (pickupAt == null || pickupAt === '') return null;
  const d = pickupAt instanceof Date ? pickupAt : new Date(pickupAt);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Athens',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
    const day = get('day');
    const month = get('month');
    const hour = get('hour');
    const minute = get('minute');
    if (!day || !month || !hour) return null;
    return `${day} ${month}, ${hour}:${minute}`;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   number?: string|null,
 *   ref?: string|null,
 *   pickupAt?: string|Date|null,
 *   text?: string|null,
 *   name?: string|null,
 * }} [opts]
 * @returns {string|null} `https://wa.me/<digits>?text=…` or null
 */
export function whatsappUrl(opts = {}) {
  const digits = whatsappDigits(opts.number);
  if (!digits) return null;

  let message = (opts.text && String(opts.text).trim()) || '';
  if (!message) {
    const ref = opts.ref != null ? String(opts.ref).trim() : '';
    if (ref) {
      const when = formatWhatsappPickup(opts.pickupAt);
      message = when
        ? `Hello, about my booking ${ref} (${when})`
        : `Hello, about my booking ${ref}`;
    } else {
      message = "Hello, I'd like information about a transfer";
    }
  }

  // Privacy: never append name / address / phone / price even if callers pass them.
  void opts.name;

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
