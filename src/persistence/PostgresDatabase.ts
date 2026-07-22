import { Pool, type PoolConfig } from "pg";

import type { PgQueryable } from "./PgQueryable";

/**
 * The Postgres connection for the All Elite Cloud platform database.
 *
 * This is the async data backbone the multi-tenant platform is built on.
 * It owns a connection pool and creates the schema on startup. It is kept
 * entirely separate from the legacy synchronous SQLite database so the
 * existing single-tenant app keeps running untouched while the platform
 * is built alongside it.
 */
export class PostgresDatabase
  implements PgQueryable
{
  private readonly pool: Pool;

  constructor(config: PoolConfig) {
    this.pool = new Pool(config);
  }

  /**
   * Creates the platform schema if it does not yet exist. Idempotent, so
   * it is safe to run on every startup. New tenant-scoped tables are
   * added here as the platform grows; each will carry an
   * `organization_id` and be indexed on it.
   */
  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        slug        TEXT NOT NULL UNIQUE,
        status      TEXT NOT NULL DEFAULT 'active',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_organizations_slug
        ON organizations (slug);
    `);
  }

  /**
   * Runs a parameterized query against the pool.
   */
  async query(
    text: string,
    params?: readonly unknown[],
  ): Promise<{
    rows: Record<string, unknown>[];
    rowCount: number | null;
  }> {
    const result = await this.pool.query(
      text,
      params as unknown[] | undefined,
    );

    return {
      rows: result.rows as Record<
        string,
        unknown
      >[],
      rowCount: result.rowCount,
    };
  }

  /**
   * Verifies connectivity, returning the server version string.
   */
  async ping(): Promise<string> {
    const result = await this.pool.query(
      "SELECT current_setting('server_version') AS version",
    );

    return String(
      (
        result.rows[0] as {
          version?: unknown;
        }
      )?.version ?? "",
    );
  }

  /**
   * Closes the pool. Called on graceful shutdown.
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
