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

    // Clients — the first tenant-scoped entity. Every tenant-scoped table
    // follows this shape: an organization_id foreign key, cascading on
    // tenant deletion, and indexed for the per-tenant queries the app
    // always makes.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        name             TEXT NOT NULL,
        email            TEXT,
        company          TEXT,
        status           TEXT NOT NULL DEFAULT 'active',
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_clients_org
        ON clients (organization_id);
    `);

    // Projects — a second tenant-scoped entity that also references a
    // client. The client_id FK is scoped to the same organization by the
    // service layer; the column simply cascades to null if the client is
    // removed, so a project is never left pointing at a deleted client.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        client_id        TEXT
                           REFERENCES clients (id) ON DELETE SET NULL,
        name             TEXT NOT NULL,
        description      TEXT,
        status           TEXT NOT NULL DEFAULT 'active',
        due_date         TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_org
        ON projects (organization_id);
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_client
        ON projects (client_id);
    `);

    // Invoices — line items in JSONB, amount in integer cents. The
    // invoice number is unique per organization, so each tenant has its
    // own INV-#### sequence with no collisions across tenants.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        number           TEXT NOT NULL,
        client_id        TEXT
                           REFERENCES clients (id) ON DELETE SET NULL,
        status           TEXT NOT NULL DEFAULT 'draft',
        currency         TEXT NOT NULL DEFAULT 'USD',
        line_items       JSONB NOT NULL DEFAULT '[]'::jsonb,
        amount_cents     INTEGER NOT NULL DEFAULT 0,
        issue_date       TEXT,
        due_date         TEXT,
        paid_date        TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL,
        UNIQUE (organization_id, number)
      );
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_org
        ON invoices (organization_id);
    `);

    // Users — login accounts within an organization. Email is unique per
    // organization, so the same person can have separate accounts across
    // tenants and logging in always resolves within one tenant.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        email            TEXT NOT NULL,
        password_hash    TEXT NOT NULL,
        name             TEXT,
        role             TEXT NOT NULL DEFAULT 'member',
        status           TEXT NOT NULL DEFAULT 'active',
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL,
        UNIQUE (organization_id, email)
      );
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_org
        ON users (organization_id);
    `);

    // Sessions — server-side login tokens. Cascades on user or org
    // deletion so revocation is automatic when either goes away.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token            TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL
                           REFERENCES users (id) ON DELETE CASCADE,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        expires_at       TEXT NOT NULL,
        created_at       TEXT NOT NULL
      );
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user
        ON sessions (user_id);
    `);

    // Per-tenant white-label branding. One row per organization (the
    // organization id is the primary key), cascading on tenant deletion.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS organization_branding (
        organization_id  TEXT PRIMARY KEY
                           REFERENCES organizations (id) ON DELETE CASCADE,
        display_name     TEXT,
        logo_url         TEXT,
        favicon_url      TEXT,
        primary_color    TEXT,
        secondary_color  TEXT,
        accent_color     TEXT,
        login_message    TEXT,
        support_email    TEXT,
        updated_at       TEXT NOT NULL
      );
    `);

    // Platform administrators (All Elite Cloud staff) — global accounts,
    // NOT tied to any organization; they act across all tenants.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS platform_admins (
        id             TEXT PRIMARY KEY,
        email          TEXT NOT NULL UNIQUE,
        password_hash  TEXT NOT NULL,
        name           TEXT,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS platform_admin_sessions (
        token       TEXT PRIMARY KEY,
        admin_id    TEXT NOT NULL
                      REFERENCES platform_admins (id) ON DELETE CASCADE,
        expires_at  TEXT NOT NULL,
        created_at  TEXT NOT NULL
      );
    `);

    // Custom (white-label) domains. Globally unique so no two tenants can
    // claim the same host; the request host resolves to the owning org.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS organization_domains (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        domain           TEXT NOT NULL UNIQUE,
        verified         BOOLEAN NOT NULL DEFAULT FALSE,
        verification_token TEXT NOT NULL DEFAULT '',
        created_at       TEXT NOT NULL
      );
    `);

    // Backfill the ownership-verification token column on tables created
    // before it existed (idempotent; the CREATE above covers fresh DBs).
    await this.pool.query(`
      ALTER TABLE organization_domains
        ADD COLUMN IF NOT EXISTS verification_token TEXT NOT NULL DEFAULT '';
    `);

    // One subscription per organization: which plan the tenant is on. The
    // plan catalog itself lives in code; this stores only the tenant's
    // choice and (later) its Stripe billing state.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS organization_subscriptions (
        organization_id        TEXT PRIMARY KEY
                                 REFERENCES organizations (id) ON DELETE CASCADE,
        plan_id                TEXT NOT NULL,
        status                 TEXT NOT NULL DEFAULT 'active',
        current_period_end     TEXT,
        stripe_customer_id     TEXT,
        stripe_subscription_id TEXT,
        updated_at             TEXT NOT NULL
      );
    `);

    // Hosting accounts (hosted websites) — the featured All Elite Hosting
    // product, ported onto the tenant template. Every row belongs to one
    // organization; a client_id (when set) is the tenant's own client.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS hosting_accounts (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        client_id        TEXT,
        domain           TEXT NOT NULL,
        plan             TEXT,
        status           TEXT NOT NULL DEFAULT 'pending',
        notes            TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
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
