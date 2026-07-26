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

    // AI-generated websites — the website builder. A website owns its
    // content (the brief and the generated HTML); every row belongs to one
    // organization, optionally to one of that org's clients.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS websites (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        client_id        TEXT,
        name             TEXT NOT NULL,
        brief            TEXT,
        accent_color     TEXT,
        html             TEXT,
        status           TEXT NOT NULL DEFAULT 'draft',
        domain           TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);

    // Per-tenant AI credentials (bring-your-own-key). One row per org; the
    // api_key is a secret and is never returned to clients in full.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS organization_ai_settings (
        organization_id  TEXT PRIMARY KEY
                           REFERENCES organizations (id) ON DELETE CASCADE,
        provider         TEXT NOT NULL,
        api_key          TEXT NOT NULL,
        model            TEXT,
        updated_at       TEXT NOT NULL
      );
    `);

    // Metered AI usage — one row per AI operation, so cost per tenant is
    // always known. cost_micros is millionths of a dollar; own_key marks
    // usage that ran on the tenant's own key (not the platform's cost).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ai_usage_events (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        kind             TEXT NOT NULL,
        provider         TEXT NOT NULL,
        model            TEXT NOT NULL,
        input_tokens     INTEGER NOT NULL DEFAULT 0,
        output_tokens    INTEGER NOT NULL DEFAULT 0,
        cost_micros      INTEGER NOT NULL DEFAULT 0,
        own_key          BOOLEAN NOT NULL DEFAULT FALSE,
        created_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ai_usage_events_org_created
        ON ai_usage_events (organization_id, created_at);
    `);

    // Support tickets — a tenant's help desk. Every row belongs to one
    // organization; a client_id (when set) is the tenant's own client.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        client_id        TEXT,
        subject          TEXT NOT NULL,
        description      TEXT,
        status           TEXT NOT NULL DEFAULT 'open',
        priority         TEXT NOT NULL DEFAULT 'medium',
        assignee         TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);

    // Email outbox — a record of every email a tenant sent (or attempted).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        to_address       TEXT NOT NULL,
        subject          TEXT NOT NULL,
        body             TEXT NOT NULL,
        from_address     TEXT NOT NULL,
        status           TEXT NOT NULL,
        provider         TEXT NOT NULL,
        error            TEXT,
        created_at       TEXT NOT NULL
      );
    `);

    // Password reset tokens — only the SHA-256 hash of each token is stored.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token_hash       TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        user_id          TEXT NOT NULL,
        expires_at       TEXT NOT NULL,
        used_at          TEXT,
        created_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
        ON password_reset_tokens (organization_id, user_id);
    `);

    // Files — tenant-scoped metadata; bytes live in a StorageProvider.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        name             TEXT NOT NULL,
        stored_key       TEXT NOT NULL,
        mime_type        TEXT NOT NULL,
        size             BIGINT NOT NULL DEFAULT 0,
        tags             JSONB NOT NULL DEFAULT '[]'::jsonb,
        subject_type     TEXT,
        subject_id       TEXT,
        uploaded_by      TEXT,
        deleted_at       TEXT,
        created_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS files_org_idx
        ON files (organization_id, deleted_at, created_at DESC);
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS files_subject_idx
        ON files (organization_id, subject_type, subject_id);
    `);

    // Activity log — the shared event spine (timeline, notifications, later
    // workflows/webhooks). One row per business event, tenant-scoped.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS activity_events (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        type             TEXT NOT NULL,
        actor_type       TEXT NOT NULL DEFAULT 'user',
        actor_id         TEXT,
        actor_name       TEXT,
        subject_type     TEXT,
        subject_id       TEXT,
        title            TEXT NOT NULL,
        summary          TEXT,
        metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS activity_events_subject_idx
        ON activity_events (organization_id, subject_type, subject_id, created_at DESC);
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS activity_events_recent_idx
        ON activity_events (organization_id, created_at DESC);
    `);

    // In-app notifications — per team member, tenant-scoped.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        user_id          TEXT NOT NULL,
        type             TEXT NOT NULL,
        title            TEXT NOT NULL,
        body             TEXT,
        link             TEXT,
        read_at          TEXT,
        created_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS notifications_user_idx
        ON notifications (organization_id, user_id, read_at, created_at DESC);
    `);

    // Autoresponder / drip: sequences, their steps, and enrollments.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS drip_sequences (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        name             TEXT NOT NULL,
        trigger          TEXT NOT NULL DEFAULT 'manual',
        status           TEXT NOT NULL DEFAULT 'active',
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS drip_steps (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        sequence_id      TEXT NOT NULL
                           REFERENCES drip_sequences (id) ON DELETE CASCADE,
        position         INTEGER NOT NULL,
        delay_hours      DOUBLE PRECISION NOT NULL DEFAULT 0,
        subject          TEXT NOT NULL,
        body             TEXT NOT NULL,
        created_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS drip_steps_sequence_idx
        ON drip_steps (organization_id, sequence_id, position);
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS drip_enrollments (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        sequence_id      TEXT NOT NULL
                           REFERENCES drip_sequences (id) ON DELETE CASCADE,
        email            TEXT NOT NULL,
        name             TEXT,
        step_index       INTEGER NOT NULL DEFAULT 0,
        status           TEXT NOT NULL DEFAULT 'active',
        next_run_at      TEXT NOT NULL,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);
    // The worker scans this index every tick to find due enrollments.
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS drip_enrollments_due_idx
        ON drip_enrollments (status, next_run_at);
    `);

    // Client-portal logins — one per client contact, scoped to an org+client.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS portal_users (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        client_id        TEXT NOT NULL,
        email            TEXT NOT NULL,
        password_hash    TEXT NOT NULL,
        created_at       TEXT NOT NULL,
        UNIQUE (organization_id, email)
      );
    `);

    // Client-portal sessions (looked up by token).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS portal_sessions (
        token            TEXT PRIMARY KEY,
        client_user_id   TEXT NOT NULL,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        client_id        TEXT NOT NULL,
        expires_at       TEXT NOT NULL,
        created_at       TEXT NOT NULL
      );
    `);

    // Products — a tenant's software products / repositories.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        client_id        TEXT,
        name             TEXT NOT NULL,
        description      TEXT,
        status           TEXT NOT NULL DEFAULT 'planning',
        repo_url         TEXT,
        language         TEXT,
        version          TEXT,
        owner            TEXT,
        notes            TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);

    // Books — a tenant's publishing pipeline.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS books (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        client_id        TEXT,
        title            TEXT NOT NULL,
        subtitle         TEXT,
        author           TEXT,
        status           TEXT NOT NULL DEFAULT 'draft',
        format           TEXT,
        isbn             TEXT,
        notes            TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);

    // Programs — a tenant's programs / classes / recurring events.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS programs (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        client_id        TEXT,
        name             TEXT NOT NULL,
        category         TEXT,
        status           TEXT NOT NULL DEFAULT 'planned',
        leader           TEXT,
        schedule         TEXT,
        description      TEXT,
        notes            TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);

    // Sales proposals — a tenant's quotes. Every row belongs to one
    // organization; a client_id (when set) is the tenant's own client.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS proposals (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        client_id        TEXT,
        title            TEXT NOT NULL,
        summary          TEXT,
        body             TEXT,
        amount           INTEGER,
        status           TEXT NOT NULL DEFAULT 'draft',
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);

    // Brands — a tenant can run several brands under one workspace.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS brands (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        name             TEXT NOT NULL,
        domain           TEXT,
        from_email       TEXT,
        email_signature  TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);

    // Customer reviews — a tenant's reputation management. Every row belongs
    // to one organization; a client_id (when set) is the tenant's own client.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        client_id        TEXT,
        author           TEXT NOT NULL,
        rating           INTEGER NOT NULL DEFAULT 5,
        comment          TEXT,
        source           TEXT,
        replied          BOOLEAN NOT NULL DEFAULT FALSE,
        reply_text       TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);

    // Marketing campaigns — a tenant's campaigns. Every row belongs to one
    // organization; a client_id (when set) is the tenant's own client.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        client_id        TEXT,
        name             TEXT NOT NULL,
        channel          TEXT,
        status           TEXT NOT NULL DEFAULT 'planned',
        audience         TEXT,
        budget           INTEGER,
        spend            INTEGER,
        start_date       TEXT,
        end_date         TEXT,
        owner            TEXT,
        notes            TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);

    // Sales leads — a tenant's CRM pipeline. Every row belongs to one
    // organization; a client_id (when set) is the tenant's own client.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id                TEXT PRIMARY KEY,
        organization_id   TEXT NOT NULL
                            REFERENCES organizations (id) ON DELETE CASCADE,
        client_id         TEXT,
        name              TEXT NOT NULL,
        company           TEXT,
        email             TEXT,
        phone             TEXT,
        source            TEXT,
        service_interest  TEXT,
        estimated_value   INTEGER,
        status            TEXT NOT NULL DEFAULT 'new',
        owner             TEXT,
        notes             TEXT,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
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
