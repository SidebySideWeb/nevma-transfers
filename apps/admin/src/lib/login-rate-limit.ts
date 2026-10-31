/** Fixed-window IP rate limit for /login (in-memory; fine for a single admin instance). */
const hits = new Map<string, { windowStart: number; count: number }>();
const WINDOW_MS = 60_000;
const MAX = 10;

export function assertLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const row = hits.get(ip);
  if (!row || now - row.windowStart >= WINDOW_MS) {
    hits.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  row.count += 1;
  return row.count <= MAX;
}

export function clearLoginRateLimits(): void {
  hits.clear();
}
