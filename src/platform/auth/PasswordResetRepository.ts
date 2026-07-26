import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type { PasswordResetRecord } from "./PasswordResetToken";

interface ResetRow {
  token_hash: string;
  organization_id: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

/**
 * Stores password reset tokens, always scoped to the current tenant. A
 * lookup is confined to the acting organization, so a token minted for one
 * organization can never be consumed against another.
 */
export class PasswordResetRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<string, PasswordResetRecord>();

  async create(
    record: Omit<
      PasswordResetRecord,
      "organizationId"
    >,
  ): Promise<PasswordResetRecord> {
    const organizationId =
      this.tenantId();

    const full: PasswordResetRecord = {
      ...record,
      organizationId,
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO password_reset_tokens
           (token_hash, organization_id, user_id,
            expires_at, used_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          full.tokenHash,
          full.organizationId,
          full.userId,
          full.expiresAt,
          full.usedAt ?? null,
          full.createdAt,
        ],
      );

      return full;
    }

    this.memory.set(
      full.tokenHash,
      full,
    );

    return full;
  }

  async findByHash(
    tokenHash: string,
  ): Promise<
    PasswordResetRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM password_reset_tokens
            WHERE token_hash = $1 AND organization_id = $2`,
          [tokenHash, organizationId],
        );

      const row = asRow(
        result.rows[0],
      );

      return row
        ? mapRow(row)
        : undefined;
    }

    const record =
      this.memory.get(tokenHash);

    return record &&
      record.organizationId ===
        organizationId
      ? record
      : undefined;
  }

  /**
   * Marks a token consumed. Idempotent; a missing token is a no-op.
   */
  async markUsed(
    tokenHash: string,
    usedAt: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE password_reset_tokens
            SET used_at = $3
          WHERE token_hash = $1 AND organization_id = $2`,
        [
          tokenHash,
          organizationId,
          usedAt,
        ],
      );

      return;
    }

    const record =
      this.memory.get(tokenHash);

    if (
      record &&
      record.organizationId ===
        organizationId
    ) {
      record.usedAt = usedAt;
    }
  }

  /**
   * Invalidates every outstanding token for a user (e.g. after one is
   * consumed, or when a new one is requested). Scoped to the tenant.
   */
  async deleteForUser(
    userId: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `DELETE FROM password_reset_tokens
          WHERE user_id = $1 AND organization_id = $2`,
        [userId, organizationId],
      );

      return;
    }

    for (const [
      hash,
      record,
    ] of this.memory) {
      if (
        record.organizationId ===
          organizationId &&
        record.userId === userId
      ) {
        this.memory.delete(hash);
      }
    }
  }
}

function asRow(
  row: Record<string, unknown> | undefined,
): ResetRow | undefined {
  return row as ResetRow | undefined;
}

function mapRow(
  row: ResetRow,
): PasswordResetRecord {
  const record: PasswordResetRecord = {
    tokenHash: row.token_hash,
    organizationId:
      row.organization_id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };

  if (row.used_at) {
    record.usedAt = row.used_at;
  }

  return record;
}
