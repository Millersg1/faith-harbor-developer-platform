import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type {
  DatabaseSync as DatabaseSyncType,
} from "node:sqlite";

const nodeRequire = createRequire(__filename);

const {
  DatabaseSync,
} = nodeRequire("node:sqlite") as {
  DatabaseSync: typeof DatabaseSyncType;
};

/**
 * Creates and initializes the Faith Harbor OS SQLite database.
 */
export class SQLiteDatabase {
  private readonly database: DatabaseSyncType;

  constructor(
    databasePath = join(
      process.cwd(),
      "data",
      "faith-harbor.db",
    ),
  ) {
    mkdirSync(
      dirname(databasePath),
      {
        recursive: true,
      },
    );

    this.database = new DatabaseSync(
      databasePath,
      {
        timeout: 5000,
      },
    );

    this.initialize();
    this.migrate();
  }

  /**
   * Returns the underlying SQLite database connection.
   */
  get connection(): DatabaseSyncType {
    return this.database;
  }

  /**
   * Closes the database connection.
   */
  close(): void {
    this.database.close();
  }

  /**
   * Creates the Faith Harbor OS database tables and indexes.
   */
  private initialize(): void {
    this.database.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS ai_provider_metrics (
        provider_id TEXT PRIMARY KEY,
        provider_name TEXT NOT NULL,
        requests INTEGER NOT NULL DEFAULT 0,
        successes INTEGER NOT NULL DEFAULT 0,
        failures INTEGER NOT NULL DEFAULT 0,
        average_response_time REAL NOT NULL DEFAULT 0,
        average_tokens REAL NOT NULL DEFAULT 0,
        estimated_cost REAL NOT NULL DEFAULT 0,
        last_used TEXT,
        reliability_score REAL NOT NULL DEFAULT 100,
        overall_score REAL NOT NULL DEFAULT 100,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS ai_decisions (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        capability TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        reason TEXT NOT NULL,
        confidence REAL NOT NULL,
        model TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL,
        primary_contact TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        website TEXT,
        industry TEXT,
        notes TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        client_name TEXT NOT NULL,
        service TEXT NOT NULL,
        requested_outcome TEXT NOT NULL,
        proposal TEXT NOT NULL,
        status TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (client_id)
          REFERENCES clients(id)
          ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        proposal_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'planned',
        start_date TEXT,
        due_date TEXT,
        completed_date TEXT,
        notes TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (client_id)
          REFERENCES clients(id)
          ON DELETE CASCADE,
        FOREIGN KEY (proposal_id)
          REFERENCES proposals(id)
          ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        number TEXT NOT NULL,
        client_id TEXT NOT NULL,
        project_id TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        currency TEXT NOT NULL DEFAULT 'USD',
        line_items_json TEXT NOT NULL DEFAULT '[]',
        amount REAL NOT NULL DEFAULT 0,
        issue_date TEXT,
        due_date TEXT,
        paid_date TEXT,
        notes TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (client_id)
          REFERENCES clients(id)
          ON DELETE CASCADE,
        FOREIGN KEY (project_id)
          REFERENCES projects(id)
          ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS support_tickets (
        id TEXT PRIMARY KEY,
        number TEXT NOT NULL,
        client_id TEXT NOT NULL,
        project_id TEXT,
        hosting_account_id TEXT,
        subject TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        priority TEXT NOT NULL DEFAULT 'medium',
        assignee TEXT,
        resolution TEXT,
        resolved_date TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (client_id)
          REFERENCES clients(id)
          ON DELETE CASCADE,
        FOREIGN KEY (project_id)
          REFERENCES projects(id)
          ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hosting_accounts (
        id TEXT PRIMARY KEY,
        client_id TEXT,
        brand TEXT,
        domain TEXT NOT NULL,
        username TEXT NOT NULL,
        plan TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        server TEXT,
        ip_address TEXT,
        disk_used_mb REAL,
        disk_limit_mb REAL,
        notes TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (client_id)
          REFERENCES clients(id)
          ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        client_id TEXT,
        title TEXT NOT NULL,
        subtitle TEXT,
        author TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        format TEXT,
        isbn TEXT,
        word_count INTEGER,
        target_date TEXT,
        published_date TEXT,
        royalties REAL,
        notes TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (client_id)
          REFERENCES clients(id)
          ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        client_id TEXT,
        name TEXT NOT NULL,
        company TEXT,
        email TEXT,
        phone TEXT,
        source TEXT,
        campaign_id TEXT,
        service_interest TEXT,
        estimated_value REAL,
        status TEXT NOT NULL DEFAULT 'new',
        owner TEXT,
        notes TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (client_id)
          REFERENCES clients(id)
          ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        client_id TEXT,
        name TEXT NOT NULL,
        channel TEXT,
        status TEXT NOT NULL DEFAULT 'planned',
        audience TEXT,
        budget REAL,
        spend REAL,
        leads INTEGER,
        start_date TEXT,
        end_date TEXT,
        owner TEXT,
        notes TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (client_id)
          REFERENCES clients(id)
          ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS ministry_programs (
        id TEXT PRIMARY KEY,
        client_id TEXT,
        name TEXT NOT NULL,
        category TEXT,
        status TEXT NOT NULL DEFAULT 'planned',
        leader TEXT,
        schedule TEXT,
        participants INTEGER,
        start_date TEXT,
        end_date TEXT,
        description TEXT,
        notes TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (client_id)
          REFERENCES clients(id)
          ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        client_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'planning',
        repo_url TEXT,
        language TEXT,
        version TEXT,
        last_release_date TEXT,
        owner TEXT,
        notes TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (client_id)
          REFERENCES clients(id)
          ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        provider TEXT NOT NULL,
        error TEXT,
        client_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (client_id)
          REFERENCES clients(id)
          ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS automation_drafts (
        id TEXT PRIMARY KEY,
        trigger TEXT NOT NULL,
        title TEXT NOT NULL,
        to_address TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        related_type TEXT NOT NULL,
        related_id TEXT NOT NULL,
        client_id TEXT,
        email_id TEXT,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        FOREIGN KEY (client_id)
          REFERENCES clients(id)
          ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS review_profiles (
        client_id TEXT PRIMARY KEY,
        business_name TEXT NOT NULL,
        review_url TEXT NOT NULL,
        google_place_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (client_id)
          REFERENCES clients(id)
          ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE IF NOT EXISTS google_reviews (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        author TEXT NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT NOT NULL,
        created_at TEXT NOT NULL,
        replied INTEGER NOT NULL DEFAULT 0,
        reply_text TEXT,
        FOREIGN KEY (client_id)
          REFERENCES clients(id)
          ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        session_id TEXT,
        checkout_url TEXT,
        created_at TEXT NOT NULL,
        paid_at TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS client_users (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (client_id)
          REFERENCES clients(id)
          ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_ai_decisions_timestamp
        ON ai_decisions(timestamp);

      CREATE INDEX IF NOT EXISTS idx_ai_decisions_provider
        ON ai_decisions(provider_id);

      CREATE INDEX IF NOT EXISTS idx_clients_company_name
        ON clients(company_name);

      CREATE INDEX IF NOT EXISTS idx_proposals_client
        ON proposals(client_id);

      CREATE INDEX IF NOT EXISTS idx_proposals_status
        ON proposals(status);

      CREATE INDEX IF NOT EXISTS idx_proposals_created
        ON proposals(created_at);

      CREATE INDEX IF NOT EXISTS idx_projects_client
        ON projects(client_id);

      CREATE INDEX IF NOT EXISTS idx_projects_proposal
        ON projects(proposal_id);

      CREATE INDEX IF NOT EXISTS idx_projects_status
        ON projects(status);

      CREATE INDEX IF NOT EXISTS idx_projects_due_date
        ON projects(due_date);

      CREATE INDEX IF NOT EXISTS idx_projects_created
        ON projects(created_at);

      CREATE INDEX IF NOT EXISTS idx_invoices_client
        ON invoices(client_id);

      CREATE INDEX IF NOT EXISTS idx_invoices_project
        ON invoices(project_id);

      CREATE INDEX IF NOT EXISTS idx_invoices_status
        ON invoices(status);

      CREATE INDEX IF NOT EXISTS idx_invoices_created
        ON invoices(created_at);

      CREATE INDEX IF NOT EXISTS idx_support_tickets_client
        ON support_tickets(client_id);

      CREATE INDEX IF NOT EXISTS idx_support_tickets_project
        ON support_tickets(project_id);

      CREATE INDEX IF NOT EXISTS idx_support_tickets_status
        ON support_tickets(status);

      CREATE INDEX IF NOT EXISTS idx_support_tickets_created
        ON support_tickets(created_at);

      CREATE INDEX IF NOT EXISTS idx_hosting_accounts_client
        ON hosting_accounts(client_id);

      CREATE INDEX IF NOT EXISTS idx_hosting_accounts_status
        ON hosting_accounts(status);

      CREATE INDEX IF NOT EXISTS idx_hosting_accounts_created
        ON hosting_accounts(created_at);

      CREATE INDEX IF NOT EXISTS idx_books_client
        ON books(client_id);

      CREATE INDEX IF NOT EXISTS idx_books_status
        ON books(status);

      CREATE INDEX IF NOT EXISTS idx_books_created
        ON books(created_at);

      CREATE INDEX IF NOT EXISTS idx_leads_client
        ON leads(client_id);

      CREATE INDEX IF NOT EXISTS idx_leads_status
        ON leads(status);

      CREATE INDEX IF NOT EXISTS idx_leads_created
        ON leads(created_at);

      CREATE INDEX IF NOT EXISTS idx_campaigns_client
        ON campaigns(client_id);

      CREATE INDEX IF NOT EXISTS idx_campaigns_status
        ON campaigns(status);

      CREATE INDEX IF NOT EXISTS idx_campaigns_created
        ON campaigns(created_at);

      CREATE INDEX IF NOT EXISTS idx_ministry_programs_client
        ON ministry_programs(client_id);

      CREATE INDEX IF NOT EXISTS idx_ministry_programs_status
        ON ministry_programs(status);

      CREATE INDEX IF NOT EXISTS idx_ministry_programs_created
        ON ministry_programs(created_at);

      CREATE INDEX IF NOT EXISTS idx_products_client
        ON products(client_id);

      CREATE INDEX IF NOT EXISTS idx_products_status
        ON products(status);

      CREATE INDEX IF NOT EXISTS idx_products_created
        ON products(created_at);

      CREATE INDEX IF NOT EXISTS idx_emails_client
        ON emails(client_id);

      CREATE INDEX IF NOT EXISTS idx_emails_created
        ON emails(created_at);
    `);
  }

  /**
   * Applies idempotent migrations to databases created by an
   * earlier version. Each statement is safe to run repeatedly.
   */
  private migrate(): void {
    const columnAdditions:
      readonly string[] = [
        "ALTER TABLE hosting_accounts ADD COLUMN brand TEXT",
        "ALTER TABLE leads ADD COLUMN campaign_id TEXT",
        "ALTER TABLE support_tickets ADD COLUMN hosting_account_id TEXT",
      ];

    for (
      const statement of
      columnAdditions
    ) {
      try {
        this.database.exec(
          statement,
        );
      } catch {
        // The column already exists; nothing to do.
      }
    }
  }
}