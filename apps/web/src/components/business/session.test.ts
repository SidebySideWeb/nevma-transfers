import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_AGE_MS,
  STORAGE_KEY,
  captureMagicLink,
  isSessionExpired,
  parseAuthHash,
  parseStoredSession,
  refreshSession,
  resetRefreshMutex,
  writeSession,
  type BizSession,
} from './session';

afterEach(() => {
  resetRefreshMutex();
});

describe('parseAuthHash', () => {
  it('reads access and refresh tokens from the hash', () => {
    expect(parseAuthHash('#access_token=a&refresh_token=r&type=magiclink')).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      error: false,
    });
  });

  it('flags error and tolerates a missing #', () => {
    expect(parseAuthHash('error=access_denied&error_description=x')).toMatchObject({
      accessToken: null,
      refreshToken: null,
      error: true,
    });
  });
});

describe('30-day boundary', () => {
  const base: BizSession = {
    accessToken: 'a',
    refreshToken: 'r',
    signedInAt: 1_000_000,
  };

  it('is live just before 30 days', () => {
    expect(isSessionExpired(base, base.signedInAt + MAX_AGE_MS - 1)).toBe(false);
    expect(parseStoredSession(JSON.stringify(base), base.signedInAt + MAX_AGE_MS - 1)).toEqual(base);
  });

  it('expires at exactly 30 days', () => {
    expect(isSessionExpired(base, base.signedInAt + MAX_AGE_MS)).toBe(true);
    expect(parseStoredSession(JSON.stringify(base), base.signedInAt + MAX_AGE_MS)).toBeNull();
  });
});

describe('parseStoredSession stale payload', () => {
  it('rejects incomplete or garbage JSON', () => {
    expect(parseStoredSession(null)).toBeNull();
    expect(parseStoredSession('{')).toBeNull();
    expect(parseStoredSession(JSON.stringify({ accessToken: 'a' }))).toBeNull();
    expect(
      parseStoredSession(JSON.stringify({ accessToken: 'a', refreshToken: '', signedInAt: 1 })),
    ).toBeNull();
    expect(
      parseStoredSession(
        JSON.stringify({ accessToken: 'a', refreshToken: 'r', signedInAt: 'nope' }),
      ),
    ).toBeNull();
  });
});

describe('captureMagicLink', () => {
  it('persists both tokens and a fresh signedInAt', () => {
    const store = memoryStorage();
    let stripped = false;
    const session = captureMagicLink(store, '#access_token=acc&refresh_token=ref', {
      now: 42,
      stripHash: () => {
        stripped = true;
      },
    });
    expect(stripped).toBe(true);
    expect(session).toEqual({ accessToken: 'acc', refreshToken: 'ref', signedInAt: 42 });
    expect(JSON.parse(store.getItem(STORAGE_KEY)!)).toEqual(session);
  });

  it('ignores access-only hashes (no refresh)', () => {
    const store = memoryStorage();
    expect(captureMagicLink(store, '#access_token=acc', { now: 1 })).toBeNull();
    expect(store.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('refreshSession', () => {
  it('keeps signedInAt and dedupes parallel refreshes', async () => {
    const store = memoryStorage();
    writeSession(store, { accessToken: 'old', refreshToken: 'r1', signedInAt: 99 });
    let calls = 0;
    const exchange = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return { accessToken: 'new', refreshToken: 'r2' };
    };
    const [a, b] = await Promise.all([
      refreshSession(store, exchange, 100),
      refreshSession(store, exchange, 100),
    ]);
    expect(calls).toBe(1);
    expect(a).toEqual({ accessToken: 'new', refreshToken: 'r2', signedInAt: 99 });
    expect(b).toEqual(a);
  });
});

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    key: (i) => [...map.keys()][i] ?? null,
  };
}
