import { describe, expect, it } from 'vitest';
import {
  autoAssignSettingValue,
  parseAutoAssignSetting,
  renderAutoBadge,
  soloVehicleHint,
  SOLO_VEHICLE_HINT,
} from './auto-badge';

describe('Auto badge', () => {
  it('renders only when vehicle_auto_assigned is true', () => {
    expect(renderAutoBadge(false)).toBe('');
    const html = renderAutoBadge(true);
    expect(html).toContain('>Auto<');
    expect(html).toContain('badge plain');
    expect(html).toContain('aria-label="Assigned automatically: the only active vehicle in this class"');
    expect(html).toContain('title="Assigned automatically: the only active vehicle in this class"');
  });
});

describe('solo vehicle hint', () => {
  it('appears only for one-vehicle classes with an empty vehicle field', () => {
    expect(soloVehicleHint(1, true)).toBe(SOLO_VEHICLE_HINT);
    expect(soloVehicleHint(1, false)).toBeNull();
    expect(soloVehicleHint(2, true)).toBeNull();
    expect(soloVehicleHint(0, true)).toBeNull();
  });
});

describe('auto_assign_single_vehicle setting', () => {
  it('writes true/false JSON strings', () => {
    expect(autoAssignSettingValue(true)).toBe('true');
    expect(autoAssignSettingValue(false)).toBe('false');
    expect(parseAutoAssignSetting(true)).toBe(true);
    expect(parseAutoAssignSetting(false)).toBe(false);
    expect(parseAutoAssignSetting('true')).toBe(true);
    expect(parseAutoAssignSetting('false')).toBe(false);
  });
});
