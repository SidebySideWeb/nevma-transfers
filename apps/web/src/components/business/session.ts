/** Corporate /business session: magic-link + refresh, hard-capped at 30 days. */

export const STORAGE_KEY = 'biz-session';
/** Legacy access-token-only key (sessionStorage). Cleared on sign-out / migrate. */
export const LEGACY_TOKEN_KEY = 'biz-token';
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type BizSession = {
  accessToken: string;
  refreshToken: string;
  signedInAt: number;
};

export type AuthHash = {
  accessToken: string | null;
  refreshToken: string | null;
  error: boolean;
};

/** Parse `#access_token=…&refresh_token=…` (with or without leading #). */
export function parseAuthHash(hash: string): AuthHash {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
    error: params.has('error'),
  };
}

export function isSessionExpired(session: Pick<BizSession, 'signedInAt'>, now = Date.now()): boolean {
  return now - session.signedInAt >= MAX_AGE_MS;
}

/** Accept only a complete, non-stale payload. */
export function parseStoredSession(raw: string | null, now = Date.now()): BizSession | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<BizSession>;
    if (
      typeof v.accessToken !== 'string' ||
      !v.accessToken ||
      typeof v.refreshToken !== 'string' ||
      !v.refreshToken ||
      typeof v.signedInAt !== 'number' ||
      !Number.isFinite(v.signedInAt)
    ) {
      return null;
    }
    const session: BizSession = {
      accessToken: v.accessToken,
      refreshToken: v.refreshToken,
      signedInAt: v.signedInAt,
    };
    if (isSessionExpired(session, now)) return null;
    return session;
  } catch {
    return null;
  }
}

export function readSession(storage: Storage, now = Date.now()): BizSession | null {
  return parseStoredSession(storage.getItem(STORAGE_KEY), now);
}

export function writeSession(storage: Storage, session: BizSession): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(storage: Storage, sessionStorageLike?: Storage | null): void {
  storage.removeItem(STORAGE_KEY);
  sessionStorageLike?.removeItem(LEGACY_TOKEN_KEY);
}

/**
 * If the URL hash carries a magic-link pair, persist a new session (fresh signedInAt)
 * and return it. Clears the hash via `stripHash` when tokens or an error are present.
 */
export function captureMagicLink(
  storage: Storage,
  hash: string,
  opts: { now?: number; stripHash?: () => void; sessionStorageLike?: Storage | null } = {},
): BizSession | null {
  const { now = Date.now(), stripHash, sessionStorageLike } = opts;
  const parsed = parseAuthHash(hash);
  if (parsed.accessToken || parsed.refreshToken || parsed.error) stripHash?.();
  if (parsed.error || !parsed.accessToken || !parsed.refreshToken) return null;
  const session: BizSession = {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    signedInAt: now,
  };
  writeSession(storage, session);
  sessionStorageLike?.removeItem(LEGACY_TOKEN_KEY);
  return session;
}

type TokenPair = { accessToken: string; refreshToken: string };

let refreshInFlight: Promise<BizSession | null> | null = null;

/**
 * Exchange the refresh token; keep original signedInAt. Single in-flight promise
 * so parallel 401s do not rotate the refresh token twice.
 */
export async function refreshSession(
  storage: Storage,
  exchange: (refreshToken: string) => Promise<TokenPair>,
  now = Date.now(),
): Promise<BizSession | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const current = readSession(storage, now);
      if (!current) {
        clearSession(storage);
        return null;
      }
      const tokens = await exchange(current.refreshToken);
      if (!tokens.accessToken || !tokens.refreshToken) {
        clearSession(storage);
        return null;
      }
      const next: BizSession = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        signedInAt: current.signedInAt,
      };
      if (isSessionExpired(next, now)) {
        clearSession(storage);
        return null;
      }
      writeSession(storage, next);
      return next;
    } catch {
      clearSession(storage);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Test helper: reset the refresh mutex between cases. */
export function resetRefreshMutex(): void {
  refreshInFlight = null;
}
