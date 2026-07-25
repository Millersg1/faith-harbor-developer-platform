import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  PlatformProposalRecord,
  PlatformProposalStatus,
} from "./PlatformProposal";

interface ProposalRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  title: string;
  summary: string | null;
  body: string | null;
  amount: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Stores proposals, always scoped to the current tenant. Same isolation
 * contract as every tenant-scoped repository.
 */
export class PlatformProposalRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      PlatformProposalRecord
    >();

  async create(
    proposal: Omit<
      PlatformProposalRecord,
      "organizationId"
    >,
  ): Promise<PlatformProposalRecord> {
    const organizationId =
      this.tenantId();

    const record: PlatformProposalRecord =
      { ...proposal, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO proposals
           (id, organization_id, client_id, title, summary, body,
            amount, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          record.id,
          record.organizationId,
          record.clientId ?? null,
          record.title,
          record.summary ?? null,
          record.body ?? null,
          record.amount ?? null,
          record.status,
          record.createdAt,
          record.updatedAt,
        ],
      );

      return record;
    }

    this.memory.set(
      record.id,
      record,
    );

    return record;
  }

  async get(
    id: string,
  ): Promise<
    PlatformProposalRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM proposals WHERE id = $1 AND organization_id = $2",
          [id, organizationId],
        );

      const row = asRow(
        result.rows[0],
      );

      return row
        ? mapRow(row)
        : undefined;
    }

    const record = this.memory.get(id);

    return record &&
      record.organizationId ===
        organizationId
      ? record
      : undefined;
  }

  async list(): Promise<
    PlatformProposalRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM proposals
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return result.rows
        .map(asRow)
        .filter(
          (
            row,
          ): row is ProposalRow =>
            row !== undefined,
        )
        .map(mapRow);
    }

    return Array.from(
      this.memory.values(),
    ).filter(
      (record) =>
        record.organizationId ===
        organizationId,
    );
  }

  async update(
    proposal: PlatformProposalRecord,
  ): Promise<PlatformProposalRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE proposals
            SET client_id = $3, title = $4, summary = $5, body = $6,
                amount = $7, status = $8, updated_at = $9
          WHERE id = $1 AND organization_id = $2`,
        [
          proposal.id,
          organizationId,
          proposal.clientId ?? null,
          proposal.title,
          proposal.summary ?? null,
          proposal.body ?? null,
          proposal.amount ?? null,
          proposal.status,
          proposal.updatedAt,
        ],
      );

      return proposal;
    }

    const existing = this.memory.get(
      proposal.id,
    );

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.set(
        proposal.id,
        proposal,
      );
    }

    return proposal;
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM proposals WHERE id = $1 AND organization_id = $2",
        [id, organizationId],
      );

      return;
    }

    const existing = this.memory.get(id);

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.delete(id);
    }
  }
}

function asRow(
  row: Record<string, unknown> | undefined,
): ProposalRow | undefined {
  return row as ProposalRow | undefined;
}

function mapRow(
  row: ProposalRow,
): PlatformProposalRecord {
  const record: PlatformProposalRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      title: row.title,
      status:
        row.status as PlatformProposalStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  if (row.client_id)
    record.clientId = row.client_id;
  if (row.summary)
    record.summary = row.summary;
  if (row.body) record.body = row.body;
  if (
    row.amount !== null &&
    row.amount !== undefined
  )
    record.amount = Number(row.amount);

  return record;
}
