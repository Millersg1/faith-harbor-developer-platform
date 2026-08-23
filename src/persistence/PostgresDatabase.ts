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
    // Durable account-email verification evidence. NULL = unverified (existing
    // users are NOT auto-verified). Cleared when the account email changes.
    await this.pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS email_verified_at TEXT;
    `);
    // Account-email verification tokens: hash-only, single-use, time-limited,
    // bound to (user id, normalized email). NOT marketing double-opt-in.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        token_hash   TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        email        TEXT NOT NULL,
        expires_at   TEXT NOT NULL,
        consumed_at  TEXT,
        created_at   TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx
        ON email_verification_tokens (user_id);
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
    // Per-form security/abuse settings (allowed origins, honeypot, timing).
    // Additive; secure defaults ('{}' = no cross-origin embedding).
    await this.pool.query(`
      ALTER TABLE forms
        ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
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
    // Attribution for a public submission (IP hash/referrer/landing + UTMs +
    // consent evidence). Additive; compact JSON, no separate PII surface.
    await this.pool.query(`
      ALTER TABLE form_submissions
        ADD COLUMN IF NOT EXISTS attribution JSONB;
    `);
    // Durable marketing-consent audit log (tenant-scoped). Records affirmative
    // consent events with the exact wording/version + evidence. No raw IP
    // (ip_hash only) and no tokens.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS marketing_consents (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        email            TEXT NOT NULL,
        form_id          TEXT,
        granted          BOOLEAN NOT NULL DEFAULT TRUE,
        wording          TEXT,
        version          TEXT,
        source           TEXT,
        ip_hash          TEXT,
        double_opt_in    BOOLEAN NOT NULL DEFAULT FALSE,
        confirmed_at     TEXT,
        created_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS marketing_consents_lookup_idx
        ON marketing_consents (organization_id, LOWER(email), created_at DESC);
    `);
    // Email suppression. TENANT-scoped rows (organization_id set) are a normal
    // recipient unsubscribe from that tenant's marketing. GLOBAL rows
    // (organization_id NULL) are platform technical suppression (hard bounce,
    // complaint, abuse, invalid recipient, legal/safety) that applies across
    // tenants but is NEVER attributed to any tenant. No tokens stored here.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS email_suppressions (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT
                           REFERENCES organizations (id) ON DELETE CASCADE,
        email            TEXT NOT NULL,
        scope            TEXT NOT NULL,
        reason           TEXT NOT NULL,
        created_at       TEXT NOT NULL
      );
    `);
    // One active suppression per (tenant, email) and per (global, email).
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS email_suppressions_tenant_uniq
        ON email_suppressions (organization_id, LOWER(email))
        WHERE organization_id IS NOT NULL;
    `);
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS email_suppressions_global_uniq
        ON email_suppressions (LOWER(email))
        WHERE organization_id IS NULL;
    `);
    // Unsubscribe capability tokens (hash-only). Map an opaque, revocable,
    // single-purpose token to a (tenant, email) so a no-login unsubscribe never
    // needs the address in the URL. Never stores the raw token.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS unsubscribe_tokens (
        token_hash       TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        email            TEXT NOT NULL,
        revoked          BOOLEAN NOT NULL DEFAULT FALSE,
        created_at       TEXT NOT NULL
      );
    `);
    // Durable marketing send outbox. One row per (enrollment, step) — the
    // UNIQUE constraint gives idempotent, EXACTLY-ONCE ENQUEUEING of one
    // logical message. This does NOT guarantee exactly-once external email
    // delivery: SMTP has an unavoidable ambiguous crash window (a crash before
    // confirmed acceptance, or after acceptance but before the DB update, both
    // land in `delivery_unknown`). Metering is exactly-once for messages
    // confirmed `sent`. Lease columns prevent two workers sending the same
    // message; an expired lease recovers safely (never a blind resend). States:
    // queued → sending → sent | failed | skipped | delivery_unknown | terminal.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS marketing_outbox (
        id                 TEXT PRIMARY KEY,
        organization_id    TEXT NOT NULL
                             REFERENCES organizations (id) ON DELETE CASCADE,
        enrollment_id      TEXT,
        sequence_id        TEXT,
        step_index         INTEGER NOT NULL DEFAULT 0,
        email              TEXT NOT NULL,
        subject            TEXT NOT NULL DEFAULT '',
        body               TEXT NOT NULL DEFAULT '',
        status             TEXT NOT NULL DEFAULT 'queued',
        attempts           INTEGER NOT NULL DEFAULT 0,
        next_attempt_at    TEXT NOT NULL,
        lease_owner        TEXT,
        lease_until        TEXT,
        provider_id        TEXT,
        message_id_header  TEXT,
        reason             TEXT,
        created_at         TEXT NOT NULL,
        updated_at         TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS marketing_outbox_step_uniq
        ON marketing_outbox (enrollment_id, step_index)
        WHERE enrollment_id IS NOT NULL;
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS marketing_outbox_claim_idx
        ON marketing_outbox (status, next_attempt_at);
    `);
    // Owner/admin resolution marker for delivery_unknown review (no resend).
    await this.pool.query(`
      ALTER TABLE marketing_outbox
        ADD COLUMN IF NOT EXISTS resolved_at TEXT;
    `);
    // Immutable, append-only attempt history — one row per attempt/action, with
    // COMPACT identifiers + enums ONLY. Never an email, name, body, address,
    // consent wording, or token. A manual retry appends a new attempt; it never
    // overwrites prior history.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS marketing_outbox_attempts (
        id             TEXT PRIMARY KEY,
        outbox_id      TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        attempt_no     INTEGER NOT NULL,
        event          TEXT NOT NULL,
        provider_id    TEXT,
        reason         TEXT,
        actor          TEXT,
        created_at     TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS marketing_outbox_attempts_idx
        ON marketing_outbox_attempts (outbox_id, created_at);
    `);
    // Per-tenant marketing sender configuration. The visible From ADDRESS is
    // usable only when its domain is platform-approved for SMTP sending;
    // otherwise a platform-controlled From on an authenticated AEC domain is
    // used with the tenant's business name + validated Reply-To. Physical
    // mailing address is required (CAN-SPAM). No SMTP credentials are stored
    // here. Website/custom-domain verification is NOT email-sending approval.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS marketing_sender_config (
        organization_id       TEXT PRIMARY KEY
                                REFERENCES organizations (id) ON DELETE CASCADE,
        business_name         TEXT,
        from_address          TEXT,
        sending_domain_approved BOOLEAN NOT NULL DEFAULT FALSE,
        reply_to              TEXT,
        physical_address      TEXT,
        status                TEXT NOT NULL DEFAULT 'incomplete',
        updated_by            TEXT,
        updated_at            TEXT NOT NULL
      );
    `);
    // Durable marketing-activation intents. Created at submission (binding the
    // EXACT terms the visitor accepted), flipped to 'ready' when consent is
    // confirmed, and turned into an enrollment by a crash-safe worker. This is
    // the durable pattern that guarantees a confirmed opt-in can never be lost
    // to a crash after the HTTP response. UNIQUE keeps activation idempotent per
    // accepted terms; the drip active-enrollment unique index is the final
    // duplicate-enrollment safeguard.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS marketing_activations (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        form_id          TEXT,
        sequence_id      TEXT NOT NULL,
        email            TEXT NOT NULL,
        consent_wording  TEXT,
        consent_version  TEXT,
        double_opt_in    BOOLEAN NOT NULL DEFAULT TRUE,
        consent_ref      TEXT,
        status           TEXT NOT NULL DEFAULT 'awaiting_confirmation',
        reason           TEXT,
        attempts         INTEGER NOT NULL DEFAULT 0,
        next_attempt_at  TEXT NOT NULL,
        confirmed_at     TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS marketing_activations_terms_uniq
        ON marketing_activations
           (organization_id, form_id, LOWER(email), consent_version);
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS marketing_activations_ready_idx
        ON marketing_activations (status, next_attempt_at);
    `);
    // Durable, crash-safe dispatch of double-opt-in CONFIRMATION emails. Kept
    // separate from marketing_outbox: confirmation email is transactional (no
    // unsubscribe headers, never metered) and keyed by activation, not
    // enrollment/step. `delivery_unknown` marks an ambiguous/crashed attempt
    // that must never be blind-resent. No raw token is ever stored here — each
    // send attempt mints a fresh confirmation token.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS confirmation_dispatch (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        activation_id    TEXT NOT NULL,
        email            TEXT NOT NULL,
        consent_ref      TEXT,
        consent_version  TEXT,
        confirm_base     TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'queued',
        attempts         INTEGER NOT NULL DEFAULT 0,
        next_attempt_at  TEXT NOT NULL,
        lease_owner      TEXT,
        lease_until      TEXT,
        provider_id      TEXT,
        reason           TEXT,
        resolved_at      TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS confirmation_dispatch_activation_uniq
        ON confirmation_dispatch (activation_id);
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS confirmation_dispatch_due_idx
        ON confirmation_dispatch (status, next_attempt_at);
    `);
    // Durable, RESTART-SAFE marketing send meter. One row per
    // (scope, window_kind, window_start): scope = an organization id or the
    // literal 'PLATFORM'; window_kind = 'hour' | 'day'. `sent_count` is the
    // marketing-metering point (confirmed SMTP acceptance, counted ONCE);
    // `attempt_count`/`failure_count`/`unknown_count` track observable SMTP
    // outcomes for storm-protection + failure-rate auto-pause, and never gate
    // metering. Counters survive restarts because they live here, not in memory.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS marketing_send_meter (
        scope_key     TEXT NOT NULL,
        window_kind   TEXT NOT NULL,
        window_start  TEXT NOT NULL,
        sent_count    INTEGER NOT NULL DEFAULT 0,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        unknown_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (scope_key, window_kind, window_start)
      );
    `);
    // Durable marketing pause state (tenant-wide or per-sequence). Auto-pause
    // records carry only a reason ENUM + threshold + scope + recovery note —
    // NEVER an address, SMTP body, content, or credential. Transactional email
    // is never affected by these rows.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS marketing_pause (
        scope       TEXT NOT NULL,
        scope_id    TEXT NOT NULL,
        paused      BOOLEAN NOT NULL DEFAULT TRUE,
        reason      TEXT,
        threshold   TEXT,
        recovery    TEXT,
        auto        BOOLEAN NOT NULL DEFAULT FALSE,
        updated_by  TEXT,
        updated_at  TEXT NOT NULL,
        PRIMARY KEY (scope, scope_id)
      );
    `);
    // Lead-magnet fulfillment (TRANSACTIONAL, independent of marketing). One row
    // per submission (unique submission_id → idempotent). Binds a SNAPSHOT of the
    // owner's magnet config so later config changes never rewrite history.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS lead_magnet_fulfillments (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        form_id          TEXT NOT NULL,
        submission_id    TEXT NOT NULL,
        magnet_id        TEXT NOT NULL,
        mode             TEXT NOT NULL,
        email            TEXT,
        file_id          TEXT,
        redirect_url     TEXT,
        email_subject    TEXT,
        status           TEXT NOT NULL,
        reason           TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS lead_magnet_fulfillments_submission_uniq
        ON lead_magnet_fulfillments (submission_id);
    `);
    // Controlled, time-limited DOWNLOAD capabilities. Opaque token stored as a
    // SHA-256 hash only; bound to org/form/fulfillment/file; short TTL + bounded
    // use count; atomic single-use redemption.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS lead_magnet_capabilities (
        token_hash       TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        form_id          TEXT NOT NULL,
        fulfillment_id   TEXT NOT NULL,
        file_id          TEXT NOT NULL,
        expires_at       TEXT NOT NULL,
        max_uses         INTEGER NOT NULL DEFAULT 1,
        used_count       INTEGER NOT NULL DEFAULT 0,
        revoked          BOOLEAN NOT NULL DEFAULT FALSE,
        created_at       TEXT NOT NULL
      );
    `);
    // Durable TRANSACTIONAL lead-magnet email dispatch (download-link email).
    // Idempotent per fulfillment; a fresh capability is minted per SMTP attempt
    // (not stored here). `delivery_unknown` = ambiguous/crashed attempt, never
    // auto-resent. No marketing metering / unsubscribe headers.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS lead_magnet_dispatch (
        id               TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        fulfillment_id   TEXT NOT NULL,
        form_id          TEXT NOT NULL,
        file_id          TEXT NOT NULL,
        email            TEXT NOT NULL,
        email_subject    TEXT,
        business_name    TEXT,
        reply_to         TEXT,
        file_title       TEXT,
        download_base    TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'queued',
        attempts         INTEGER NOT NULL DEFAULT 0,
        next_attempt_at  TEXT NOT NULL,
        lease_owner      TEXT,
        lease_until      TEXT,
        provider_id      TEXT,
        reason           TEXT,
        resolved_at      TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS lead_magnet_dispatch_fulfillment_uniq
        ON lead_magnet_dispatch (fulfillment_id);
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS lead_magnet_dispatch_due_idx
        ON lead_magnet_dispatch (status, next_attempt_at);
    `);
    // One-time, opaque DOWNLOAD-SESSION capabilities (the httpOnly cookie issued
    // by the fragment exchange). Hash-only, short-TTL, single-use, atomically
    // consumed, bound to org/fulfillment/file/purpose. Durable so it survives a
    // restart within its short window and is multi-worker-safe.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS lead_magnet_download_sessions (
        session_hash     TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        fulfillment_id   TEXT NOT NULL,
        file_id          TEXT NOT NULL,
        purpose          TEXT NOT NULL,
        expires_at       TEXT NOT NULL,
        used             BOOLEAN NOT NULL DEFAULT FALSE,
        created_at       TEXT NOT NULL
      );
    `);
    // Double-opt-in confirmation tokens (hash-only, single-use, time-limited).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS double_optin_tokens (
        token_hash       TEXT PRIMARY KEY,
        organization_id  TEXT NOT NULL
                           REFERENCES organizations (id) ON DELETE CASCADE,
        email            TEXT NOT NULL,
        consent_id       TEXT,
        version          TEXT,
        expires_at       TEXT NOT NULL,
        consumed_at      TEXT,
        created_at       TEXT NOT NULL
      );
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
    // Compact per-enrollment event marker (e.g. "skipped:unsubscribed",
    // "sent:step0") — non-PII reason for send/skip/fail. Additive.
    await this.pool.query(`
      ALTER TABLE drip_enrollments
        ADD COLUMN IF NOT EXISTS last_event TEXT;
    `);
    // Enrollment uniqueness: at most ONE ACTIVE enrollment per
    // (tenant, sequence, email). Partial unique index makes dedup atomic while
    // still allowing legitimate RE-enrollment after a completed/canceled run
    // (see docs/20 — "once active at a time").
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS drip_enrollments_active_uniq
        ON drip_enrollments (organization_id, sequence_id, LOWER(email))
        WHERE status = 'active';
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

    // Platform legal documents — All Elite Cloud's OWN legal docs (Terms,
    // Privacy, etc.). GLOBAL (no organization_id): there is one set, managed
    // by platform owners and served at /legal/*. Published versions are
    // immutable; editing a published doc creates a new version row. History is
    // retained so acceptance records can point at the exact accepted version.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS platform_legal_documents (
        id                 TEXT PRIMARY KEY,
        kind               TEXT NOT NULL,
        version            INTEGER NOT NULL,
        title              TEXT NOT NULL,
        summary            TEXT NOT NULL,
        body_markdown      TEXT NOT NULL,
        status             TEXT NOT NULL DEFAULT 'draft',
        effective_date     TEXT,
        requires_reconsent BOOLEAN NOT NULL DEFAULT FALSE,
        created_at         TEXT NOT NULL,
        updated_at         TEXT NOT NULL,
        published_at       TEXT,
        created_by         TEXT,
        UNIQUE (kind, version)
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS platform_legal_documents_kind_status_idx
        ON platform_legal_documents (kind, status, version DESC);
    `);

    // Terms/Privacy acceptance evidence — one row per user acceptance of a
    // specific platform document version. Tenant-scoped (organization_id) so a
    // tenant admin can only ever see their own org's acceptance history.
    // Append-only by convention: publishing a new version never rewrites past
    // rows, preserving what was actually agreed and when.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS legal_acceptances (
        id                 TEXT PRIMARY KEY,
        organization_id    TEXT NOT NULL
                             REFERENCES organizations (id) ON DELETE CASCADE,
        user_id            TEXT NOT NULL,
        document_kind      TEXT NOT NULL,
        document_version   INTEGER NOT NULL,
        accepted_at        TEXT NOT NULL,
        source             TEXT NOT NULL,
        ip                 TEXT
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS legal_acceptances_user_idx
        ON legal_acceptances (organization_id, user_id, document_kind);
    `);

    // Tenant website legal documents — each organization's OWN legal pages for
    // its generated website(s). Tenant-scoped and versioned, same immutability
    // model as platform docs. A questionnaire (below) feeds generation.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tenant_legal_documents (
        id                 TEXT PRIMARY KEY,
        organization_id    TEXT NOT NULL
                             REFERENCES organizations (id) ON DELETE CASCADE,
        kind               TEXT NOT NULL,
        version            INTEGER NOT NULL,
        title              TEXT NOT NULL,
        body_markdown      TEXT NOT NULL,
        status             TEXT NOT NULL DEFAULT 'draft',
        human_reviewed     BOOLEAN NOT NULL DEFAULT FALSE,
        effective_date     TEXT,
        created_at         TEXT NOT NULL,
        updated_at         TEXT NOT NULL,
        published_at       TEXT,
        created_by         TEXT,
        UNIQUE (organization_id, kind, version)
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS tenant_legal_documents_kind_status_idx
        ON tenant_legal_documents (organization_id, kind, status, version DESC);
    `);

    // One legal questionnaire per organization (the verified facts used to
    // generate that tenant's website legal pages). Singleton per tenant.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tenant_legal_questionnaire (
        organization_id    TEXT PRIMARY KEY
                             REFERENCES organizations (id) ON DELETE CASCADE,
        answers            JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at         TEXT NOT NULL
      );
    `);

    // Privacy / data-subject requests — public intake, tenant-scoped when the
    // request targets a specific tenant. Never auto-deletes retained records.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS privacy_requests (
        id                 TEXT PRIMARY KEY,
        organization_id    TEXT,
        type               TEXT NOT NULL,
        email              TEXT NOT NULL,
        details            TEXT,
        status             TEXT NOT NULL DEFAULT 'received',
        assigned_to        TEXT,
        created_at         TEXT NOT NULL,
        updated_at         TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS privacy_requests_org_idx
        ON privacy_requests (organization_id, status, created_at DESC);
    `);

    // Phase 5 privacy-request workflow — ADDITIVE columns on the existing
    // privacy_requests table (existing columns reused: id, organization_id
    // [NULL for platform requests], type=category, email, details=description,
    // status, assigned_to, created_at, updated_at). Raw tokens are NEVER stored
    // — only SHA-256 hashes.
    await this.pool.query(`
      ALTER TABLE privacy_requests
        ADD COLUMN IF NOT EXISTS destination        TEXT,
        ADD COLUMN IF NOT EXISTS name               TEXT,
        ADD COLUMN IF NOT EXISTS relationship       TEXT,
        ADD COLUMN IF NOT EXISTS verification_state TEXT NOT NULL DEFAULT 'unverified',
        ADD COLUMN IF NOT EXISTS verify_token_hash  TEXT,
        ADD COLUMN IF NOT EXISTS verify_expires_at  TEXT,
        ADD COLUMN IF NOT EXISTS status_token_hash  TEXT,
        ADD COLUMN IF NOT EXISTS resolution_summary TEXT,
        ADD COLUMN IF NOT EXISTS due_date           TEXT,
        ADD COLUMN IF NOT EXISTS due_date_source    TEXT,
        ADD COLUMN IF NOT EXISTS verified_at        TEXT,
        ADD COLUMN IF NOT EXISTS acknowledged_at    TEXT,
        ADD COLUMN IF NOT EXISTS completed_at       TEXT,
        ADD COLUMN IF NOT EXISTS denied_at          TEXT,
        ADD COLUMN IF NOT EXISTS closed_at          TEXT,
        ADD COLUMN IF NOT EXISTS purge_after        TEXT,
        ADD COLUMN IF NOT EXISTS verify_email_state    TEXT NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS verify_email_error    TEXT,
        ADD COLUMN IF NOT EXISTS verify_email_attempts INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS verify_email_last_at  TEXT;
    `);
    // Tenant deletion cascades its privacy requests (platform requests keep a
    // NULL organization_id and are unaffected). Idempotent FK addition.
    await this.pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'privacy_requests_org_fk'
        ) THEN
          ALTER TABLE privacy_requests
            ADD CONSTRAINT privacy_requests_org_fk
            FOREIGN KEY (organization_id) REFERENCES organizations (id)
            ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    // Token lookups (verification + requester status) are by hash — indexed.
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS privacy_requests_verify_hash_idx
        ON privacy_requests (verify_token_hash);
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS privacy_requests_status_hash_idx
        ON privacy_requests (status_token_hash);
    `);
    // Timeline: internal notes + requester-facing messages, cascaded to the
    // request. Kept separate so internal notes never reach the requester view.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS privacy_request_notes (
        id          TEXT PRIMARY KEY,
        request_id  TEXT NOT NULL
                      REFERENCES privacy_requests (id) ON DELETE CASCADE,
        visibility  TEXT NOT NULL DEFAULT 'internal',
        author_id   TEXT,
        body        TEXT NOT NULL,
        created_at  TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS privacy_request_notes_req_idx
        ON privacy_request_notes (request_id, created_at);
    `);
    // Durable, queryable, tenant-NEUTRAL audit trail for platform-level actions
    // (e.g. platform-admin privacy-request lifecycle). Append-only; stores only
    // compact enums + identifiers — never names, emails, descriptions, notes,
    // or tokens. Distinct from tenant-scoped `audit_events` (which requires an
    // organization_id and cannot record org-neutral platform actions).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS platform_audit_events (
        id          TEXT PRIMARY KEY,
        action      TEXT NOT NULL,
        actor_type  TEXT NOT NULL DEFAULT 'platform_admin',
        actor_id    TEXT,
        target_type TEXT,
        target_id   TEXT,
        outcome     TEXT,
        metadata    TEXT,
        created_at  TEXT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS platform_audit_events_created_idx
        ON platform_audit_events (created_at DESC);
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS platform_audit_events_target_idx
        ON platform_audit_events (target_type, target_id);
    `);

    // Legal holds — while a hold exists for an organization, the retention
    // purge skips that organization entirely (nothing is purged under hold).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS legal_holds (
        organization_id  TEXT PRIMARY KEY
                           REFERENCES organizations (id) ON DELETE CASCADE,
        reason           TEXT,
        created_at       TEXT NOT NULL
      );
    `);

    // ===================================================================
    // Domain registration subsystem (Stage 3). Additive + idempotent.
    //
    // OWNERSHIP EXCEPTION — deliberate departure from the platform's usual
    // `organization_id ... ON DELETE CASCADE`: a customer domain is EXTERNAL
    // PROPERTY the customer legally owns. Confirmed registrations, orders,
    // contacts, provider attempts, terms acceptances, transfers, lifecycle
    // history, and support actions therefore reference organizations with
    // `ON DELETE RESTRICT` — deleting an organization FAILS CLOSED while any of
    // these exist, forcing an explicit domain-disposition process first. Only
    // `domain_quotes` (disposable, unpaid advisory data) cascades. Tables that
    // are children of a registration cascade from `domain_registrations` (so a
    // properly-dispositioned registration takes its own children with it) while
    // still being blocked at the organization level by the registration's own
    // RESTRICT. Money is BIGINT minor units + an explicit ISO currency; no
    // floating point, no implicit FX. Encrypted PII lives only in
    // `domain_contacts` as an authenticated envelope; audit/attempt tables hold
    // compact ids + enums only. States are application-enforced TEXT (project
    // convention) — no PG enum types, for forward-compatible migrations.
    // ===================================================================

    // Immutable pricing-rule versions (global). A quote/order references the
    // version it was priced under; changing rules never rewrites old rows.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS domain_pricing_versions (
        version       INTEGER PRIMARY KEY,
        rule          JSONB NOT NULL,
        note          TEXT,
        created_at    TEXT NOT NULL
      );

      -- Advisory quotes (disposable; may cascade on org deletion / retention).
      CREATE TABLE IF NOT EXISTS domain_quotes (
        id                  TEXT PRIMARY KEY,
        organization_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
        ascii_domain        TEXT NOT NULL,
        unicode_domain      TEXT NOT NULL,
        tld                 TEXT NOT NULL,
        is_premium          BOOLEAN NOT NULL DEFAULT FALSE,
        years               INTEGER NOT NULL,
        operation           TEXT NOT NULL DEFAULT 'register',
        provider            TEXT NOT NULL,
        currency            TEXT NOT NULL,
        provider_cost_minor BIGINT NOT NULL,
        markup_minor        BIGINT NOT NULL,
        customer_price_minor BIGINT NOT NULL,
        renewal_cost_minor  BIGINT,
        renewal_price_minor BIGINT,
        transfer_price_minor BIGINT,
        pricing_version     INTEGER NOT NULL,
        status              TEXT NOT NULL DEFAULT 'active',
        created_at          TEXT NOT NULL,
        expires_at          TEXT NOT NULL
      );
      ALTER TABLE domain_quotes ADD COLUMN IF NOT EXISTS operation TEXT NOT NULL DEFAULT 'register';
      CREATE INDEX IF NOT EXISTS idx_domain_quotes_org ON domain_quotes (organization_id);
      CREATE INDEX IF NOT EXISTS idx_domain_quotes_domain ON domain_quotes (organization_id, ascii_domain);

      -- The purchase saga. RESTRICT: an order is money + a registration attempt.
      CREATE TABLE IF NOT EXISTS domain_orders (
        id                    TEXT PRIMARY KEY,
        organization_id       TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        quote_id              TEXT REFERENCES domain_quotes (id) ON DELETE SET NULL,
        ascii_domain          TEXT NOT NULL,
        unicode_domain        TEXT NOT NULL,
        tld                   TEXT NOT NULL,
        is_premium            BOOLEAN NOT NULL DEFAULT FALSE,
        years                 INTEGER NOT NULL,
        provider              TEXT NOT NULL,
        currency              TEXT NOT NULL,
        provider_cost_minor   BIGINT NOT NULL,
        markup_minor          BIGINT NOT NULL,
        customer_price_minor  BIGINT NOT NULL,
        pricing_version       INTEGER NOT NULL,
        enable_privacy        BOOLEAN NOT NULL DEFAULT TRUE,
        auto_renew_choice     BOOLEAN NOT NULL DEFAULT FALSE,
        status                TEXT NOT NULL DEFAULT 'quoted',
        idempotency_key       TEXT NOT NULL,
        stripe_checkout_id    TEXT,
        stripe_payment_intent_id TEXT,
        charged_minor         BIGINT,
        refunded_minor        BIGINT,
        attempts              INTEGER NOT NULL DEFAULT 0,
        next_attempt_at       TEXT,
        lease_owner           TEXT,
        lease_until           TEXT,
        reason                TEXT,
        provider_correlation_id TEXT,
        created_at            TEXT NOT NULL,
        updated_at            TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS domain_orders_idem_uniq ON domain_orders (idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_domain_orders_org ON domain_orders (organization_id);
      CREATE INDEX IF NOT EXISTS domain_orders_claim_idx ON domain_orders (status, next_attempt_at);
      -- At most ONE active purchase attempt per (org, domain).
      CREATE UNIQUE INDEX IF NOT EXISTS domain_orders_active_uniq
        ON domain_orders (organization_id, ascii_domain)
        WHERE status IN ('quoted','payment_pending','paid','registration_queued','registration_processing');
      -- Stage 6: SEPARATE durable payment / registrar / refund state (never
      -- overload the status column), plus binding + timing evidence.
      ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS payment_state TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS registrar_state TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS refund_state TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT;
      ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS user_id TEXT;
      ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS terms_acceptance_id TEXT;
      ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS contact_ref TEXT;
      ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS captured_at TEXT;
      ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS registered_at TEXT;
      -- One active purchase saga per accepted quote (a quote is single-use).
      CREATE UNIQUE INDEX IF NOT EXISTS domain_orders_quote_uniq
        ON domain_orders (quote_id) WHERE quote_id IS NOT NULL;
      -- One captured payment (payment intent) maps to exactly one order.
      CREATE UNIQUE INDEX IF NOT EXISTS domain_orders_pi_uniq
        ON domain_orders (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

      -- Refund intents — one per order, deterministic idempotency key. A failed
      -- refund stays visible (state='failed') for needs_attention.
      CREATE TABLE IF NOT EXISTS domain_refunds (
        id                  TEXT PRIMARY KEY,
        organization_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        order_id            TEXT NOT NULL REFERENCES domain_orders (id) ON DELETE RESTRICT,
        stripe_charge_id    TEXT,
        stripe_refund_id    TEXT,
        amount_minor        BIGINT NOT NULL,
        currency            TEXT NOT NULL,
        reason              TEXT NOT NULL,
        state               TEXT NOT NULL DEFAULT 'queued',
        idempotency_key     TEXT NOT NULL,
        attempts            INTEGER NOT NULL DEFAULT 0,
        next_attempt_at     TEXT,
        lease_owner         TEXT,
        lease_until         TEXT,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS domain_refunds_order_uniq ON domain_refunds (order_id);
      CREATE UNIQUE INDEX IF NOT EXISTS domain_refunds_idem_uniq ON domain_refunds (idempotency_key);
      CREATE INDEX IF NOT EXISTS domain_refunds_claim_idx ON domain_refunds (state, next_attempt_at);

      -- Confirmed ownership (external property). RESTRICT at the org level.
      CREATE TABLE IF NOT EXISTS domain_registrations (
        id                  TEXT PRIMARY KEY,
        organization_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        order_id            TEXT REFERENCES domain_orders (id) ON DELETE RESTRICT,
        ascii_domain        TEXT NOT NULL,
        unicode_domain      TEXT NOT NULL,
        tld                 TEXT NOT NULL,
        provider            TEXT NOT NULL,
        provider_domain_id  TEXT,
        registered_at       TEXT NOT NULL,
        expires_at          TEXT,
        status              TEXT NOT NULL DEFAULT 'active',
        disposition         TEXT NOT NULL DEFAULT 'retained_active',
        locked              BOOLEAN,
        privacy_state       TEXT,
        autorenew_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );
      -- One confirmed registration per registry identity (provider guarantees it).
      CREATE UNIQUE INDEX IF NOT EXISTS domain_registrations_provider_domain_uniq
        ON domain_registrations (provider, ascii_domain);
      CREATE INDEX IF NOT EXISTS idx_domain_registrations_org ON domain_registrations (organization_id);
      -- Stage 7: provider-truth freshness. Cached facts are never presented as
      -- current registrar truth; sync_state ∈ fresh|stale|unknown|needs_attention.
      ALTER TABLE domain_registrations ADD COLUMN IF NOT EXISTS last_provider_sync_at TEXT;
      ALTER TABLE domain_registrations ADD COLUMN IF NOT EXISTS sync_state TEXT NOT NULL DEFAULT 'unknown';

      -- Encrypted registrant/admin/tech/billing contacts, WITH version history.
      -- Rows are immutable evidence; a correction inserts a new version and
      -- flips is_current on the prior row (the ciphertext/actor/effective_at of
      -- an accepted version is never altered).
      CREATE TABLE IF NOT EXISTS domain_contacts (
        id                  TEXT PRIMARY KEY,
        organization_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        registration_id     TEXT NOT NULL REFERENCES domain_registrations (id) ON DELETE CASCADE,
        contact_role        TEXT NOT NULL,
        version             INTEGER NOT NULL,
        is_current          BOOLEAN NOT NULL DEFAULT TRUE,
        contact_ciphertext  TEXT NOT NULL,
        enc_alg             TEXT NOT NULL,
        key_version         INTEGER NOT NULL,
        email_blind_index   TEXT,
        phone_blind_index   TEXT,
        effective_at        TEXT NOT NULL,
        actor_id            TEXT,
        reason              TEXT,
        provider_correlation_id TEXT,
        pending_provider_verification BOOLEAN NOT NULL DEFAULT FALSE,
        created_at          TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS domain_contacts_current_uniq
        ON domain_contacts (registration_id, contact_role) WHERE is_current;
      CREATE UNIQUE INDEX IF NOT EXISTS domain_contacts_version_uniq
        ON domain_contacts (registration_id, contact_role, version);
      CREATE INDEX IF NOT EXISTS idx_domain_contacts_email_bi
        ON domain_contacts (organization_id, email_blind_index);
      ALTER TABLE domain_contacts ADD COLUMN IF NOT EXISTS accuracy_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE domain_contacts ADD COLUMN IF NOT EXISTS authorized_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

      -- Append-only provider-attempt history (compact ids + enums only).
      CREATE TABLE IF NOT EXISTS domain_provider_attempts (
        id                  TEXT PRIMARY KEY,
        organization_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        order_id            TEXT REFERENCES domain_orders (id) ON DELETE RESTRICT,
        registration_id     TEXT REFERENCES domain_registrations (id) ON DELETE RESTRICT,
        operation           TEXT NOT NULL,
        outcome             TEXT NOT NULL,
        attempt_no          INTEGER NOT NULL DEFAULT 1,
        error_category      TEXT,
        provider_correlation_id TEXT,
        created_at          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_domain_attempts_order ON domain_provider_attempts (order_id);

      -- Immutable terms-acceptance evidence (references, not bodies).
      CREATE TABLE IF NOT EXISTS domain_terms_acceptances (
        id                       TEXT PRIMARY KEY,
        organization_id          TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        user_id                  TEXT,
        order_id                 TEXT REFERENCES domain_orders (id) ON DELETE RESTRICT,
        aec_terms_version        INTEGER NOT NULL,
        registrar_agreement_ref  TEXT NOT NULL,
        registrar_agreement_fingerprint TEXT,
        pricing_version          INTEGER NOT NULL,
        quote_id                 TEXT,
        years                    INTEGER NOT NULL,
        auto_renew_choice        BOOLEAN NOT NULL DEFAULT FALSE,
        accepted_at              TEXT NOT NULL,
        source                   TEXT,
        ip                       TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_domain_terms_org ON domain_terms_acceptances (organization_id);
      ALTER TABLE domain_terms_acceptances ADD COLUMN IF NOT EXISTS ascii_domain TEXT;
      ALTER TABLE domain_terms_acceptances ADD COLUMN IF NOT EXISTS operation TEXT;
      ALTER TABLE domain_terms_acceptances ADD COLUMN IF NOT EXISTS final_price_minor BIGINT;
      ALTER TABLE domain_terms_acceptances ADD COLUMN IF NOT EXISTS currency TEXT;
      ALTER TABLE domain_terms_acceptances ADD COLUMN IF NOT EXISTS premium_acknowledged BOOLEAN NOT NULL DEFAULT FALSE;
      CREATE INDEX IF NOT EXISTS idx_domain_terms_user ON domain_terms_acceptances (organization_id, user_id);

      -- Append-only lifecycle history (registered/renewed/expiring/etc.).
      CREATE TABLE IF NOT EXISTS domain_lifecycle_events (
        id                  TEXT PRIMARY KEY,
        organization_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        registration_id     TEXT NOT NULL REFERENCES domain_registrations (id) ON DELETE CASCADE,
        event_type          TEXT NOT NULL,
        detail              TEXT,
        actor_id            TEXT,
        provider_correlation_id TEXT,
        occurred_at         TEXT NOT NULL,
        created_at          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_domain_lifecycle_reg ON domain_lifecycle_events (registration_id, occurred_at DESC);

      -- De-duplicated lifecycle notices (durable outbox; one per type per reg).
      CREATE TABLE IF NOT EXISTS domain_notices (
        id                  TEXT PRIMARY KEY,
        organization_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        registration_id     TEXT NOT NULL REFERENCES domain_registrations (id) ON DELETE CASCADE,
        notice_type         TEXT NOT NULL,
        status              TEXT NOT NULL DEFAULT 'queued',
        attempts            INTEGER NOT NULL DEFAULT 0,
        next_attempt_at     TEXT,
        lease_owner         TEXT,
        lease_until         TEXT,
        provider_id         TEXT,
        reason              TEXT,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS domain_notices_dedup_uniq
        ON domain_notices (registration_id, notice_type);
      CREATE INDEX IF NOT EXISTS domain_notices_claim_idx ON domain_notices (status, next_attempt_at);

      -- Transfer requests (outgoing/incoming). Never stores a raw EPP code.
      CREATE TABLE IF NOT EXISTS domain_transfer_requests (
        id                  TEXT PRIMARY KEY,
        organization_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        registration_id     TEXT REFERENCES domain_registrations (id) ON DELETE RESTRICT,
        direction           TEXT NOT NULL,
        ascii_domain        TEXT NOT NULL,
        state               TEXT NOT NULL DEFAULT 'pending',
        provider_correlation_id TEXT,
        epp_capability_id   TEXT,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_domain_transfers_org ON domain_transfer_requests (organization_id);

      -- DNS/nameserver provisioning state, kept SEPARATE from registration status.
      CREATE TABLE IF NOT EXISTS domain_dns_state (
        id                  TEXT PRIMARY KEY,
        organization_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        registration_id     TEXT NOT NULL REFERENCES domain_registrations (id) ON DELETE CASCADE,
        mode                TEXT NOT NULL DEFAULT 'registrar_default',
        nameservers         TEXT,
        provisioning_status TEXT NOT NULL DEFAULT 'none',
        hosting_account_id  TEXT REFERENCES hosting_accounts (id) ON DELETE SET NULL,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS domain_dns_state_reg_uniq ON domain_dns_state (registration_id);
      -- Stage 8: DNSSEC status + provider-sync freshness (cached DNS facts are
      -- never presented as current provider truth without a sync timestamp).
      ALTER TABLE domain_dns_state ADD COLUMN IF NOT EXISTS dnssec_status TEXT NOT NULL DEFAULT 'unknown';
      ALTER TABLE domain_dns_state ADD COLUMN IF NOT EXISTS last_provider_sync_at TEXT;
      ALTER TABLE domain_dns_state ADD COLUMN IF NOT EXISTS sync_state TEXT NOT NULL DEFAULT 'unknown';
      -- Stage 8 boundary reconciliation: which DNS service is AUTHORITATIVE for
      -- the zone (namesilo | cpanel | external | unknown) + freshness of that
      -- determination. Zone-record mutation is permitted ONLY when a managed
      -- provider is authoritative AND freshly verified; cPanel/external domains
      -- are externally managed until a dedicated adapter is built.
      ALTER TABLE domain_dns_state ADD COLUMN IF NOT EXISTS authority_provider TEXT NOT NULL DEFAULT 'unknown';
      ALTER TABLE domain_dns_state ADD COLUMN IF NOT EXISTS authority_state TEXT NOT NULL DEFAULT 'unknown';
      ALTER TABLE domain_dns_state ADD COLUMN IF NOT EXISTS authority_verified_at TEXT;

      -- Stage 8: the managed desired zone (labels + values). Diffed for preview
      -- and reconciled against the live provider zone. CASCADE on registration.
      CREATE TABLE IF NOT EXISTS domain_dns_records (
        id                  TEXT PRIMARY KEY,
        organization_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        registration_id     TEXT NOT NULL REFERENCES domain_registrations (id) ON DELETE CASCADE,
        record_type         TEXT NOT NULL,
        host                TEXT NOT NULL,
        value               TEXT NOT NULL,
        ttl                 INTEGER NOT NULL DEFAULT 3600,
        priority            INTEGER,
        protected           BOOLEAN NOT NULL DEFAULT FALSE,
        provider_record_id  TEXT,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_domain_dns_records_reg ON domain_dns_records (registration_id);
      CREATE UNIQUE INDEX IF NOT EXISTS domain_dns_records_uniq
        ON domain_dns_records (registration_id, record_type, host, value);

      -- Stage 8: append-only, PII-minimised DNS change audit. Stores change type
      -- + record type + host LABEL + a value FINGERPRINT — never the value body.
      CREATE TABLE IF NOT EXISTS domain_dns_changes (
        id                  TEXT PRIMARY KEY,
        organization_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        registration_id     TEXT NOT NULL REFERENCES domain_registrations (id) ON DELETE CASCADE,
        change_type         TEXT NOT NULL,
        record_type         TEXT,
        host                TEXT,
        value_fingerprint   TEXT,
        outcome             TEXT NOT NULL,
        actor_user_id       TEXT,
        created_at          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_domain_dns_changes_reg ON domain_dns_changes (registration_id);

      -- Append-only platform-admin support/reconciliation actions (no PII).
      CREATE TABLE IF NOT EXISTS domain_support_actions (
        id                  TEXT PRIMARY KEY,
        organization_id     TEXT REFERENCES organizations (id) ON DELETE RESTRICT,
        order_id            TEXT REFERENCES domain_orders (id) ON DELETE RESTRICT,
        registration_id     TEXT REFERENCES domain_registrations (id) ON DELETE RESTRICT,
        action              TEXT NOT NULL,
        actor_admin_id      TEXT,
        outcome             TEXT,
        created_at          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_domain_support_order ON domain_support_actions (order_id);

      -- ===== Stage 9: RENEWALS (separate billing lifecycle) =================
      -- Renewal saga orders. RESTRICT on org + registration (money + a domain
      -- lifecycle action). Renewal price is quoted SEPARATELY from registration.
      CREATE TABLE IF NOT EXISTS domain_renewal_orders (
        id                    TEXT PRIMARY KEY,
        organization_id       TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        registration_id       TEXT NOT NULL REFERENCES domain_registrations (id) ON DELETE RESTRICT,
        user_id               TEXT,
        ascii_domain          TEXT NOT NULL,
        tld                   TEXT NOT NULL,
        term_years            INTEGER NOT NULL,
        provider              TEXT NOT NULL,
        currency              TEXT NOT NULL,
        provider_cost_minor   BIGINT NOT NULL,
        markup_minor          BIGINT NOT NULL,
        customer_price_minor  BIGINT NOT NULL,
        pricing_version       INTEGER NOT NULL,
        current_expires_at    TEXT NOT NULL,
        new_expires_at        TEXT,
        mode                  TEXT NOT NULL,               -- manual | auto
        charge_path           TEXT NOT NULL,               -- checkout | off_session
        terms_acceptance_id   TEXT,
        status                TEXT NOT NULL DEFAULT 'quote_ready',
        payment_state         TEXT NOT NULL DEFAULT 'none',
        renewal_state         TEXT NOT NULL DEFAULT 'none',
        refund_state          TEXT NOT NULL DEFAULT 'none',
        idempotency_key       TEXT NOT NULL,
        stripe_checkout_id    TEXT,
        stripe_payment_intent_id TEXT,
        stripe_charge_id      TEXT,
        charged_minor         BIGINT,
        attempts              INTEGER NOT NULL DEFAULT 0,
        next_attempt_at       TEXT,
        lease_owner           TEXT,
        lease_until           TEXT,
        reason                TEXT,
        provider_correlation_id TEXT,
        captured_at           TEXT,
        renewed_at            TEXT,
        created_at            TEXT NOT NULL,
        updated_at            TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS domain_renewal_orders_idem_uniq ON domain_renewal_orders (idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_domain_renewal_orders_org ON domain_renewal_orders (organization_id);
      CREATE INDEX IF NOT EXISTS domain_renewal_orders_claim_idx ON domain_renewal_orders (status, next_attempt_at);
      CREATE UNIQUE INDEX IF NOT EXISTS domain_renewal_orders_pi_uniq
        ON domain_renewal_orders (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
      -- At most ONE in-flight/successful renewal per (registration, expiration
      -- cycle, term) — prevents a duplicate renewal for the same cycle.
      CREATE UNIQUE INDEX IF NOT EXISTS domain_renewal_active_uniq
        ON domain_renewal_orders (registration_id, current_expires_at, term_years)
        WHERE status IN ('quote_ready','checkout_created','off_session_authorized',
          'awaiting_payment','payment_captured','renewal_queued','renewing',
          'renewal_unknown','renewed');

      -- Renewal refunds — one per renewal order, deterministic idempotency key.
      CREATE TABLE IF NOT EXISTS domain_renewal_refunds (
        id                  TEXT PRIMARY KEY,
        organization_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        renewal_order_id    TEXT NOT NULL REFERENCES domain_renewal_orders (id) ON DELETE RESTRICT,
        stripe_charge_id    TEXT,
        stripe_refund_id    TEXT,
        amount_minor        BIGINT NOT NULL,
        currency            TEXT NOT NULL,
        reason              TEXT NOT NULL,
        state               TEXT NOT NULL DEFAULT 'queued',
        idempotency_key     TEXT NOT NULL,
        attempts            INTEGER NOT NULL DEFAULT 0,
        next_attempt_at     TEXT,
        lease_owner         TEXT,
        lease_until         TEXT,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS domain_renewal_refunds_order_uniq ON domain_renewal_refunds (renewal_order_id);
      CREATE UNIQUE INDEX IF NOT EXISTS domain_renewal_refunds_idem_uniq ON domain_renewal_refunds (idempotency_key);
      CREATE INDEX IF NOT EXISTS domain_renewal_refunds_claim_idx ON domain_renewal_refunds (state, next_attempt_at);

      -- Per-registration auto-renew AUTHORIZATION. Opt-in, OFF by default
      -- (absence = off). Stores the durable off-session authorization + the
      -- eligible saved payment method reference (never card data).
      CREATE TABLE IF NOT EXISTS domain_autorenew (
        registration_id     TEXT PRIMARY KEY REFERENCES domain_registrations (id) ON DELETE CASCADE,
        organization_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        enabled             BOOLEAN NOT NULL DEFAULT FALSE,
        authorized_by_user_id TEXT,
        authorized_at       TEXT,
        terms_acceptance_id TEXT,
        pricing_version_ack INTEGER,
        stripe_customer_ref TEXT,
        stripe_payment_method_ref TEXT,
        currency            TEXT,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_domain_autorenew_org ON domain_autorenew (organization_id);
      -- Stage L1: durable auto-renew SCANNER lease + backoff (the scheduler
      -- claims due rows with FOR UPDATE SKIP LOCKED; the DB duplicate guard
      -- domain_renewal_active_uniq remains the final protection).
      ALTER TABLE domain_autorenew ADD COLUMN IF NOT EXISTS lease_owner TEXT;
      ALTER TABLE domain_autorenew ADD COLUMN IF NOT EXISTS lease_until TEXT;
      ALTER TABLE domain_autorenew ADD COLUMN IF NOT EXISTS next_scan_at TEXT;

      -- Append-only IMMUTABLE consent evidence for off-session renewal
      -- authorization (Stage 11). One row per consent event; disabling
      -- auto-renew never deletes the history. Stores ONLY Stripe identifiers +
      -- the terms/pricing versions consented to + a mandate-text hash — never
      -- card data.
      CREATE TABLE IF NOT EXISTS domain_autorenew_consents (
        id                        TEXT PRIMARY KEY,
        organization_id           TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        registration_id           TEXT NOT NULL REFERENCES domain_registrations (id) ON DELETE RESTRICT,
        user_id                   TEXT,
        terms_acceptance_id       TEXT,
        pricing_version_ack       INTEGER,
        stripe_customer_ref       TEXT,
        stripe_payment_method_ref TEXT,
        setup_intent_id           TEXT,
        mandate_text_hash         TEXT,
        currency                  TEXT,
        consented_at              TEXT NOT NULL,
        created_at                TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_domain_autorenew_consents_reg ON domain_autorenew_consents (registration_id);

      -- Provider-attempt audit gains a renewal-order link (renewals reuse the
      -- same append-only, PII-free attempt log as registrations).
      ALTER TABLE domain_provider_attempts
        ADD COLUMN IF NOT EXISTS renewal_order_id TEXT REFERENCES domain_renewal_orders (id) ON DELETE RESTRICT;
      CREATE INDEX IF NOT EXISTS idx_domain_attempts_renewal ON domain_provider_attempts (renewal_order_id);

      -- ===== Stage 10: TRANSFERS ===========================================
      -- Incoming-transfer saga orders. The EPP/auth code is stored ENCRYPTED
      -- (envelope ciphertext) and destroyed (set NULL) after the single
      -- submission attempt or terminal state. RESTRICT on org + (once set)
      -- registration. registration_id is set only on completion.
      CREATE TABLE IF NOT EXISTS domain_transfer_orders (
        id                    TEXT PRIMARY KEY,
        organization_id       TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        registration_id       TEXT REFERENCES domain_registrations (id) ON DELETE RESTRICT,
        user_id               TEXT,
        ascii_domain          TEXT NOT NULL,
        tld                   TEXT NOT NULL,
        provider              TEXT NOT NULL,
        currency              TEXT NOT NULL,
        provider_cost_minor   BIGINT NOT NULL,
        markup_minor          BIGINT NOT NULL,
        customer_price_minor  BIGINT NOT NULL,
        pricing_version       INTEGER NOT NULL,
        terms_acceptance_id   TEXT,
        epp_ciphertext        TEXT,                        -- encrypted; NULL after use
        status                TEXT NOT NULL DEFAULT 'quote_ready',
        payment_state         TEXT NOT NULL DEFAULT 'none',
        transfer_state        TEXT NOT NULL DEFAULT 'none',
        refund_state          TEXT NOT NULL DEFAULT 'none',
        idempotency_key       TEXT NOT NULL,
        stripe_checkout_id    TEXT,
        stripe_payment_intent_id TEXT,
        stripe_charge_id      TEXT,
        charged_minor         BIGINT,
        provider_correlation_id TEXT,
        preserve_nameservers  BOOLEAN NOT NULL DEFAULT TRUE,
        attempts              INTEGER NOT NULL DEFAULT 0,
        next_attempt_at       TEXT,
        lease_owner           TEXT,
        lease_until           TEXT,
        reason                TEXT,
        captured_at           TEXT,
        submitted_at          TEXT,
        completed_at          TEXT,
        created_at            TEXT NOT NULL,
        updated_at            TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS domain_transfer_orders_idem_uniq ON domain_transfer_orders (idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_domain_transfer_orders_org ON domain_transfer_orders (organization_id);
      CREATE INDEX IF NOT EXISTS domain_transfer_orders_claim_idx ON domain_transfer_orders (status, next_attempt_at);
      CREATE UNIQUE INDEX IF NOT EXISTS domain_transfer_orders_pi_uniq
        ON domain_transfer_orders (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
      -- One active incoming transfer per (org, domain).
      CREATE UNIQUE INDEX IF NOT EXISTS domain_transfer_active_uniq
        ON domain_transfer_orders (organization_id, ascii_domain)
        WHERE status IN ('quote_ready','checkout_created','awaiting_payment','payment_captured',
          'transfer_submitting','transfer_pending','transfer_unknown','transfer_completed');

      CREATE TABLE IF NOT EXISTS domain_transfer_refunds (
        id                  TEXT PRIMARY KEY,
        organization_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        transfer_order_id   TEXT NOT NULL REFERENCES domain_transfer_orders (id) ON DELETE RESTRICT,
        stripe_charge_id    TEXT,
        stripe_refund_id    TEXT,
        amount_minor        BIGINT NOT NULL,
        currency            TEXT NOT NULL,
        reason              TEXT NOT NULL,
        state               TEXT NOT NULL DEFAULT 'queued',
        idempotency_key     TEXT NOT NULL,
        attempts            INTEGER NOT NULL DEFAULT 0,
        next_attempt_at     TEXT,
        lease_owner         TEXT,
        lease_until         TEXT,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS domain_transfer_refunds_order_uniq ON domain_transfer_refunds (transfer_order_id);
      CREATE UNIQUE INDEX IF NOT EXISTS domain_transfer_refunds_idem_uniq ON domain_transfer_refunds (idempotency_key);
      CREATE INDEX IF NOT EXISTS domain_transfer_refunds_claim_idx ON domain_transfer_refunds (state, next_attempt_at);

      -- Outgoing-transfer deliberate-action audit. Append-only, PII-free, and
      -- it NEVER stores the auth code — only the delivery channel + outcome.
      CREATE TABLE IF NOT EXISTS domain_outgoing_transfer_actions (
        id                  TEXT PRIMARY KEY,
        organization_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
        registration_id     TEXT NOT NULL REFERENCES domain_registrations (id) ON DELETE RESTRICT,
        action              TEXT NOT NULL,               -- unlock | relock | request_auth_code
        outcome             TEXT NOT NULL,
        code_delivery       TEXT,                        -- returned | emailed_to_registrant | unsupported
        actor_user_id       TEXT,
        created_at          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_domain_outgoing_reg ON domain_outgoing_transfer_actions (registration_id);

      -- Provider-attempt audit gains a transfer-order link.
      ALTER TABLE domain_provider_attempts
        ADD COLUMN IF NOT EXISTS transfer_order_id TEXT REFERENCES domain_transfer_orders (id) ON DELETE RESTRICT;
      CREATE INDEX IF NOT EXISTS idx_domain_attempts_transfer ON domain_provider_attempts (transfer_order_id);
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
