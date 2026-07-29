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

    // Per-tenant shared workspace/dashboard preferences. One row per
    // organization, cascading on tenant deletion.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS organization_workspace_preferences (
        organization_id      TEXT PRIMARY KEY
                               REFERENCES organizations (id) ON DELETE CASCADE,
        onboarding_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at           TEXT NOT NULL
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
    // Reverse lookups from a Stripe id to the owning org — used to bind
    // subscription/invoice webhook events to a tenant WITHOUT trusting event
    // metadata (the mapping is established, signature-verified, at checkout).
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS organization_subscriptions_customer_idx
        ON organization_subscriptions (stripe_customer_id);
      CREATE INDEX IF NOT EXISTS organization_subscriptions_subscription_idx
        ON organization_subscriptions (stripe_subscription_id);
    `);
    // Idempotency ledger: every Stripe webhook event id we have processed, so
    // duplicate/replayed deliveries are no-ops. Global (not tenant-scoped) —
    // the event is deduped before we resolve which tenant it belongs to.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS stripe_processed_events (
        event_id     TEXT PRIMARY KEY,
        type         TEXT NOT NULL,
        processed_at TEXT NOT NULL
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
        source_template_id TEXT,
        source_edition_id  TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);

    // Additive migration for databases created before website provenance
    // existed: add the source columns if missing (existing rows keep NULL).
    await this.pool.query(
      "ALTER TABLE websites ADD COLUMN IF NOT EXISTS source_template_id TEXT;",
    );
    await this.pool.query(
      "ALTER TABLE websites ADD COLUMN IF NOT EXISTS source_edition_id TEXT;",
    );

    // Durable per-website generation lock: one row while a generation is in
    // flight, so concurrent/duplicate generate requests can't both run and
    // double-meter AI usage. Cross-process safe (unlike an in-memory flag).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS website_generation_locks (
        website_id       TEXT PRIMARY KEY
                           REFERENCES websites (id) ON DELETE CASCADE,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        idempotency_key  TEXT,
        started_at       TEXT NOT NULL
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

    // AI knowledge base — collections, documents, and chunks (tenant-scoped).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_collections (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        name             TEXT NOT NULL,
        description      TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        collection_id    TEXT NOT NULL
                           REFERENCES knowledge_collections (id) ON DELETE CASCADE,
        name             TEXT NOT NULL,
        mime_type        TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'processing',
        chunk_count      INTEGER NOT NULL DEFAULT 0,
        error            TEXT,
        created_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        collection_id    TEXT NOT NULL,
        document_id      TEXT NOT NULL,
        position         INTEGER NOT NULL,
        content          TEXT NOT NULL,
        created_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS knowledge_chunks_collection_idx
        ON knowledge_chunks (organization_id, collection_id);
    `);

    // Calendar events — tenant-scoped; times stored as UTC ISO strings.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        title            TEXT NOT NULL,
        description      TEXT,
        location         TEXT,
        start_at         TEXT NOT NULL,
        end_at           TEXT,
        all_day          BOOLEAN NOT NULL DEFAULT FALSE,
        subject_type     TEXT,
        subject_id       TEXT,
        created_by       TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS calendar_events_range_idx
        ON calendar_events (organization_id, start_at);
    `);

    // Forms — no-code forms with a globally-unique public slug, + submissions.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS forms (
        id                   TEXT PRIMARY KEY,
        organization_id      TEXT NOT NULL
                               REFERENCES organizations (id) ON DELETE CASCADE,
        name                 TEXT NOT NULL,
        slug                 TEXT NOT NULL UNIQUE,
        fields               JSONB NOT NULL DEFAULT '[]'::jsonb,
        confirmation_message TEXT NOT NULL DEFAULT '',
        notify_email         TEXT,
        create_lead          BOOLEAN NOT NULL DEFAULT TRUE,
        status               TEXT NOT NULL DEFAULT 'active',
        created_at           TEXT NOT NULL,
        updated_at           TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS forms_org_idx
        ON forms (organization_id, created_at DESC);
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS form_submissions (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        form_id          TEXT NOT NULL
                           REFERENCES forms (id) ON DELETE CASCADE,
        data             JSONB NOT NULL DEFAULT '{}'::jsonb,
        status           TEXT NOT NULL DEFAULT 'new',
        created_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS form_submissions_idx
        ON form_submissions (organization_id, form_id, created_at DESC);
    `);

    // Workflows — tenant automations, and their runs (advanced by the worker).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        name             TEXT NOT NULL,
        trigger          TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'active',
        steps            JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS workflows_trigger_idx
        ON workflows (organization_id, status, trigger);
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        workflow_id      TEXT NOT NULL
                           REFERENCES workflows (id) ON DELETE CASCADE,
        trigger_type     TEXT NOT NULL,
        subject_type     TEXT,
        subject_id       TEXT,
        context_email    TEXT,
        context_name     TEXT,
        step_index       INTEGER NOT NULL DEFAULT 0,
        status           TEXT NOT NULL DEFAULT 'running',
        next_run_at      TEXT NOT NULL,
        log              JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS workflow_runs_due_idx
        ON workflow_runs (status, next_run_at);
    `);

    // AI tool invocations — read history + pending write proposals, tenant-scoped.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ai_tool_invocations (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        tool_name        TEXT NOT NULL,
        mode             TEXT NOT NULL,
        args             JSONB NOT NULL DEFAULT '{}'::jsonb,
        status           TEXT NOT NULL DEFAULT 'pending',
        summary          TEXT,
        requested_by     TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ai_tool_invocations_org_idx
        ON ai_tool_invocations (organization_id, status, created_at);
    `);

    // AI employees — saved, role-scoped assistants, tenant-scoped.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ai_employees (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        name             TEXT NOT NULL,
        title            TEXT NOT NULL DEFAULT 'Assistant',
        persona          TEXT NOT NULL DEFAULT '',
        tool_names       JSONB NOT NULL DEFAULT '[]'::jsonb,
        status           TEXT NOT NULL DEFAULT 'active',
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ai_employees_org_idx
        ON ai_employees (organization_id, created_at);
    `);

    // Command Center conversations — private to the creating user within their
    // organization. Messages cascade on conversation (and tenant) deletion.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        user_id          TEXT NOT NULL,
        ai_employee_id   TEXT,
        title            TEXT NOT NULL DEFAULT 'New conversation',
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ai_conversations_user_idx
        ON ai_conversations (organization_id, user_id, updated_at);
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ai_conversation_messages (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        conversation_id  TEXT NOT NULL
                           REFERENCES ai_conversations (id) ON DELETE CASCADE,
        role             TEXT NOT NULL,
        content          TEXT NOT NULL,
        provider         TEXT,
        model            TEXT,
        metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ai_conversation_messages_idx
        ON ai_conversation_messages (organization_id, conversation_id, created_at);
    `);

    // Audit log — append-only security trail, tenant-scoped.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        action           TEXT NOT NULL,
        actor_type       TEXT NOT NULL DEFAULT 'user',
        actor_id         TEXT,
        actor_label      TEXT,
        target_type      TEXT,
        target_id        TEXT,
        outcome          TEXT,
        ip               TEXT,
        metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS audit_events_org_idx
        ON audit_events (organization_id, created_at DESC);
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
