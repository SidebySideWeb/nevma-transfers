/**
 * Corporate pricing helpers (pure). B9.
 * Company fixed price beats discount; discount applies before rounding; demand never applies.
 */

/**
 * @param {number} cents
 * @param {number|null|undefined} discountPct
 * @returns {{ cents: number, saved: number }}
 */
export function applyCompanyDiscount(cents, discountPct) {
  const pct = Number(discountPct) || 0;
  if (pct <= 0 || cents <= 0) return { cents: Math.trunc(cents), saved: 0 };
  const next = Math.round(Math.trunc(cents) * (1 - pct / 100));
  return { cents: next, saved: Math.trunc(cents) - next };
}

/**
 * Resolve company base for a class, or null to use public pricing + discount.
 * @param {Record<string, number|null|undefined>|null|undefined} companyPrices
 * @param {string} classKey
 * @returns {number|null}
 */
export function companyBasePrice(companyPrices, classKey) {
  if (!companyPrices || typeof companyPrices !== 'object') return null;
  const v = companyPrices[classKey];
  return Number.isFinite(v) && v >= 0 ? Math.trunc(/** @type {number} */ (v)) : null;
}
