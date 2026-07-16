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
   * Creates the initial AI Operations tables.
   */
  private initialize(): void {
    this.database.exec(`
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

      CREATE INDEX IF NOT EXISTS idx_ai_decisions_timestamp
        ON ai_decisions(timestamp);

      CREATE INDEX IF NOT EXISTS idx_ai_decisions_provider
        ON ai_decisions(provider_id);
    `);
  }
}