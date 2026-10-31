/** True when integration tests can open Postgres via DATABASE_URL. */
export const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
