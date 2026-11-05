import pg, { type QueryResultRow } from "pg";

let pool: pg.Pool | null = null;

/**
 * Native PostgreSQL connection for trusted server-side operations.
 * Do not import this file into browser bundles or use the pool as an
 * unrestricted replacement for user-scoped/row-level-security queries.
 */
export function getPostgresPool(): pg.Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for PostgreSQL server access");
  }
  pool = new pg.Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
    application_name: "assetflow-api",
  });
  pool.on("error", (error) => {
    console.error("[Database] Idle PostgreSQL connection failed", error);
  });
  return pool;
}

/** Parameterize all external values; never interpolate user input into SQL. */
export async function queryPostgres<T extends QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const response = await getPostgresPool().query<T>(sql, [...params]);
  return response.rows;
}
