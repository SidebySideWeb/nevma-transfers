import { describe, expect, it } from 'vitest';
import {
  REBUILD_COOLDOWN_MS,
  clearPricesChanged,
  hasPricesChanged,
  markPricesChanged,
  readRebuildRequestedAt,
  rebuildCooldownRemainingMs,
  setRebuildRequestedAt,
  signPricesChangedValue,
  signRebuildRequestedValue,
} from './price-update-cookies';
import { callWebsiteDeployHook, setDeployHookFetch } from './deploy-hook';

function mockCookies(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get(name: string) {
      const v = store.get(name);
      return v ? { value: v } : undefined;
    },
    set(name: string, value: string) {
      store.set(name, value);
    },
    delete(name: string) {
      store.delete(name);
    },
    _store: store,
  };
}

describe('price-update cookies (AC-31)', () => {
  it('marks and reads prices_changed; clear removes it', () => {
    const cookies = mockCookies() as unknown as Parameters<typeof markPricesChanged>[0];
    expect(hasPricesChanged(cookies)).toBe(false);
    markPricesChanged(cookies);
    expect(hasPricesChanged(cookies)).toBe(true);
    clearPricesChanged(cookies);
    expect(hasPricesChanged(cookies)).toBe(false);
  });

  it('rebuild cooldown lasts 2 minutes', () => {
    const cookies = mockCookies() as unknown as Parameters<typeof setRebuildRequestedAt>[0];
    const now = 1_700_000_000_000;
    setRebuildRequestedAt(cookies, now);
    expect(readRebuildRequestedAt(cookies)).toBe(now);
    expect(rebuildCooldownRemainingMs(cookies, now + 30_000)).toBe(REBUILD_COOLDOWN_MS - 30_000);
    expect(rebuildCooldownRemainingMs(cookies, now + REBUILD_COOLDOWN_MS)).toBe(0);
  });

  it('signed helpers round-trip through cookie jar', () => {
    const cookies = mockCookies({
      prices_changed: signPricesChangedValue(),
      rebuild_requested_at: signRebuildRequestedValue(42),
    }) as unknown as Parameters<typeof hasPricesChanged>[0];
    expect(hasPricesChanged(cookies)).toBe(true);
    expect(readRebuildRequestedAt(cookies)).toBe(42);
  });
});

describe('deploy hook (AC-31)', () => {
  it('calls the hook once and reports failure without clearing', async () => {
    let calls = 0;
    setDeployHookFetch(async () => {
      calls += 1;
      return new Response(null, { status: 500 });
    });
    process.env.TEM_WEB_DEPLOY_HOOK_URL = 'https://example.test/hook';
    const fail = await callWebsiteDeployHook();
    expect(fail.ok).toBe(false);
    expect(calls).toBe(1);

    setDeployHookFetch(async () => {
      calls += 1;
      return new Response(null, { status: 201 });
    });
    const ok = await callWebsiteDeployHook();
    expect(ok).toEqual({ ok: true });
    expect(calls).toBe(2);
    setDeployHookFetch(null);
    delete process.env.TEM_WEB_DEPLOY_HOOK_URL;
  });
});
