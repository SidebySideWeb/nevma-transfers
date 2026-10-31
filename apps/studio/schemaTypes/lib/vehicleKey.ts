// The vehicle class key joins Sanity content to Postgres `vehicle_classes.key`.
// Lowercase letters, digits and single hyphens; must start and end with a letter or digit.
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateVehicleKey(value: unknown): true | string {
  if (typeof value !== 'string' || value.length === 0) return 'Key is required';
  if (!KEY.test(value)) return 'Use lowercase letters, digits and single hyphens only (for example v-class)';
  return true;
}
