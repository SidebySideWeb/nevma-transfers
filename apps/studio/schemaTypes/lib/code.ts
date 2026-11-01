// Codes shared with Postgres (zone codes, form keys): lowercase letters, digits, single hyphens.
const CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateCode(value: unknown): true | string {
  if (typeof value !== 'string' || value.length === 0) return 'Code is required';
  if (!CODE.test(value)) return 'Use lowercase letters, digits and single hyphens only (for example demo-airport)';
  return true;
}
