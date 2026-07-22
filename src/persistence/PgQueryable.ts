/**
 * The minimal async query surface the tenancy layer needs from Postgres.
 *
 * Repositories depend on this interface rather than on the `pg` package
 * directly, so they can run against a real Postgres pool in production
 * and against an in-memory fallback in tests — the test suite never has
 * to open a database connection.
 */
export interface PgQueryable {
  query(
    text: string,
    params?: readonly unknown[],
  ): Promise<{
    rows: Record<string, unknown>[];
    rowCount: number | null;
  }>;
}
