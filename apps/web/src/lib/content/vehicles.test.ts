import { describe, expect, it } from 'vitest';
import { fleetVehiclePaths } from './vehicles';

describe('fleet vehicle paths (V2-4)', () => {
  it('only publishable class keys become /fleet/[key] paths (others 404)', () => {
    const paths = fleetVehiclePaths([
      { key: 'v-class', name: 'V-Class' },
      { key: 'e-class', name: 'E-Class' },
    ]);
    const keys = paths.map((p) => p.params.key);
    expect(keys).toEqual(['v-class', 'e-class']);
    expect(keys).not.toContain('demo-limo');
    expect(keys).not.toContain('unknown');
  });
});
