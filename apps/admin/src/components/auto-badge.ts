/** Neutral "Auto" badge when the DB single-vehicle rule set the vehicle. */

export const AUTO_ASSIGN_LABEL =
  'Assigned automatically: the only active vehicle in this class';

export function renderAutoBadge(vehicleAutoAssigned: boolean): string {
  if (!vehicleAutoAssigned) return '';
  return `<span class="badge plain" title="${AUTO_ASSIGN_LABEL}" aria-label="${AUTO_ASSIGN_LABEL}">Auto</span>`;
}

/** Hint under the office new-booking vehicle field when the class has one active vehicle. */
export const SOLO_VEHICLE_HINT =
  'The vehicle is assigned automatically (only one in this class)';

export function soloVehicleHint(activeVehicleCount: number, vehicleFieldEmpty: boolean): string | null {
  if (!vehicleFieldEmpty || activeVehicleCount !== 1) return null;
  return SOLO_VEHICLE_HINT;
}

/** Settings value written for `auto_assign_single_vehicle` (boolean JSON). */
export function autoAssignSettingValue(on: boolean): string {
  return on ? 'true' : 'false';
}

export function parseAutoAssignSetting(value: unknown): boolean {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return true;
}
