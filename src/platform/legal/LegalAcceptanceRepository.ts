import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type { LegalKind } from "./PlatformLegalDocument";
import type { LegalAcceptanceRecord } from "./LegalAcceptance";

interface Row {
  id: string;
  organization_id: string;
  user_id: string;
  document_kind: string;
  document_version: number;
  accepted_at: string;
  source: string;
  ip: string | null;
}

/**
 * Stores legal-acceptance evidence for the acting tenant. Append-only: there
 * is no update or delete path, and the organization id is stamped from the
 * tenant context (fail-closed), so one tenant can never read or alter
 * another tenant's acceptance history — and history is never rewritten.
 */
export class LegalAcceptanceRepository extends TenantScopedRepository {
  private readonly memory: LegalAcceptanceRecord[] = [];

  async create(
    record: Omit<LegalAcceptanceRecord, "organizationId">,
  ): Promise<LegalAcceptanceRecord> {
    const organizationId = this.tenantId();
    const full: LegalAcceptanceRecord = {
      ...record,
      organizationId,
    };
    if (this.db) {
      await this.db.query(
        `INSERT INTO legal_acceptances
           (id, organization_id, user_id, document_kind, document_version,
            accepted_at, source, ip)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          full.id,
          full.organizationId,
          full.userId,
          full.documentKind,
          full.documentVersion,
          full.acceptedAt,
          full.source,
          full.ip,
        ],
      );
      return full;
    }
    this.memory.push(full);
    return full;
  }

  /** Every acceptance row for one user in the acting tenant. */
  async listForUser(
    userId: string,
  ): Promise<LegalAcceptanceRecord[]> {
    const organizationId = this.tenantId();
    if (this.db) {
      const result = await this.db.query(
        `SELECT * FROM legal_acceptances
          WHERE organization_id = $1 AND user_id = $2
          ORDER BY accepted_at DESC`,
        [organizationId, userId],
      );
      return mapRows(result.rows);
    }
    return this.memory.filter(
      (r) =>
        r.organizationId === organizationId &&
        r.userId === userId,
    );
  }

  /** Whether a user has accepted a specific kind + version. */
  async hasAccepted(
    userId: string,
    kind: LegalKind,
    version: number,
  ): Promise<boolean> {
    const organizationId = this.tenantId();
    if (this.db) {
      const result = await this.db.query(
        `SELECT 1 FROM legal_acceptances
          WHERE organization_id = $1 AND user_id = $2
            AND document_kind = $3 AND document_version = $4
          LIMIT 1`,
        [organizationId, userId, kind, version],
      );
      return result.rows.length > 0;
    }
    return this.memory.some(
      (r) =>
        r.organizationId === organizationId &&
        r.userId === userId &&
        r.documentKind === kind &&
        r.documentVersion === version,
    );
  }
}

function mapRows(
  rows: Record<string, unknown>[],
): LegalAcceptanceRecord[] {
  return rows.map((raw) => {
    const row = raw as unknown as Row;
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      documentKind: row.document_kind as LegalKind,
      documentVersion: Number(row.document_version),
      acceptedAt: row.accepted_at,
      source: row.source,
      ip: row.ip,
    };
  });
}
