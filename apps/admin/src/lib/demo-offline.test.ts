import { describe, expect, it } from 'vitest';
import { isDemoOrOffline, withDemoOfflineLast } from './demo-offline';

describe('demo-offline', () => {
  it('flags demo, inactive and non-active vehicle status', () => {
    expect(isDemoOrOffline({ is_demo: true, active: true })).toBe(true);
    expect(isDemoOrOffline({ is_demo: false, active: false })).toBe(true);
    expect(isDemoOrOffline({ is_demo: false, status: 'maintenance' })).toBe(true);
    expect(isDemoOrOffline({ is_demo: false, active: true, status: 'active' })).toBe(false);
  });

  it('sorts demo and offline last while keeping relative order', () => {
    const { rows, hiddenCount } = withDemoOfflineLast([
      { id: 'demo', is_demo: true, active: true },
      { id: 'ok', is_demo: false, active: true },
      { id: 'off', is_demo: false, active: false },
      { id: 'ok2', is_demo: false, active: true },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['ok', 'ok2', 'demo', 'off']);
    expect(hiddenCount).toBe(2);
  });
});
