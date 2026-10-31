import 'server-only';
import pg from 'pg';

export type SqlResult<T> = { rows: T[] };

export type BookingDb = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlResult<T>>;
};

let override: BookingDb | null = null;
let pool: pg.Pool | null = null;

function poolFromEnv(): pg.Pool {
  const url = process.env.DATABASE_URL || import.meta.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required for booking API database access');
  }
  if (!pool) {
    pool = new pg.Pool({ connectionString: String(url), max: 6 });
  }
  return pool;
}

export function setBookingDb(db: BookingDb | null): void {
  override = db;
}

export function bookingDb(): BookingDb {
  if (override) return override;
  const p = poolFromEnv();
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await p.query(sql, params);
      return { rows: r.rows as T[] };
    },
  };
}

export function dbFromPool(p: pg.Pool): BookingDb {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await p.query(sql, params);
      return { rows: r.rows as T[] };
    },
  };
}
