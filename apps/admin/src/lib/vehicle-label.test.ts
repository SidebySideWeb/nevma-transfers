import { describe, expect, it } from 'vitest';
import { displayVehicleLabel } from './vehicle-label';

describe('displayVehicleLabel', () => {
  it('normalises uppercase and hyphen indices to E-Class #1', () => {
    expect(displayVehicleLabel('E-Class #1')).toBe('E-Class #1');
    expect(displayVehicleLabel('E-CLASS #1')).toBe('E-Class #1');
    expect(displayVehicleLabel('DEMO E-CLASS-1')).toBe('DEMO E-Class #1');
    expect(displayVehicleLabel('Vito #2')).toBe('Vito #2');
  });
});
