import type { DatabaseSync } from "node:sqlite";

import type { ApiKeyRecord } from "./ApiKeyTypes";

interface ApiKeyRow {
  id: string;
  name: string;
  brand_id: string | null;
  key_hash: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
}

/**
 * Stores API keys. In memory without a database; persistent with
 * SQLite. Only hashes are stored, never raw keys.
 */
export class ApiKeyRepository {
  private readonly keys =
    new Map<string, ApiKeyRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    record: ApiKeyRecord,
  ): ApiKeyRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO api_keys (
            id, name, brand_id, key_hash, prefix, created_at, last_used_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          record.id,
          record.name,
          record.brandId ?? null,
          record.keyHash,
          record.prefix,
          record.createdAt,
          record.lastUsedAt ?? null,
        );

      return record;
    }

    this.keys.set(record.id, record);

    return record;
  }

  /**
   * Finds a key by the SHA-256 hash of the presented raw key.
   */
  findByHash(
    keyHash: string,
  ): ApiKeyRecord | undefined {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT id, name, brand_id, key_hash, prefix, created_at, last_used_at
            FROM api_keys
            WHERE key_hash = ?
          `)
          .get(keyHash) as unknown as
          ApiKeyRow | undefined;

      return row
        ? this.mapRow(row)
        : undefined;
    }

    for (const record of this.keys.values()) {
      if (record.keyHash === keyHash) {
        return record;
      }
    }

    return undefined;
  }

  /**
   * Records the moment a key was last used for authentication.
   */
  touch(
    id: string,
    when: string,
  ): void {
    if (this.database) {
      this.database
        .prepare(
          "UPDATE api_keys SET last_used_at = ? WHERE id = ?",
        )
        .run(when, id);

      return;
    }

    const record = this.keys.get(id);

    if (record) {
      record.lastUsedAt = when;
    }
  }

  list(): ApiKeyRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT id, name, brand_id, key_hash, prefix, created_at, last_used_at
            FROM api_keys
            ORDER BY created_at DESC
          `)
          .all() as unknown as ApiKeyRow[];

      return rows.map((row) =>
        this.mapRow(row),
      );
    }

    return Array.from(this.keys.values());
  }

  delete(id: string): void {
    if (this.database) {
      this.database
        .prepare(
          "DELETE FROM api_keys WHERE id = ?",
        )
        .run(id);

      return;
    }

    this.keys.delete(id);
  }

  private mapRow(
    row: ApiKeyRow,
  ): ApiKeyRecord {
    const record: ApiKeyRecord = {
      id: row.id,
      name: row.name,
      keyHash: row.key_hash,
      prefix: row.prefix,
      createdAt: row.created_at,
    };

    if (row.brand_id) {
      record.brandId = row.brand_id;
    }

    if (row.last_used_at) {
      record.lastUsedAt =
        row.last_used_at;
    }

    return record;
  }
}
