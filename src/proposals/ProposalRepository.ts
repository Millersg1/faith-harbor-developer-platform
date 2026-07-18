import type {
  DatabaseSync,
} from "node:sqlite";

import type { ProposalRecord } from "./ProposalRecord";
import type { ProposalStatus } from "./ProposalStatus";

interface ProposalRow {
  id: string;
  client_id: string;
  client_name: string;
  service: string;
  requested_outcome: string;
  proposal: string;
  status: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * Stores and retrieves proposal records.
 *
 * Without a database connection, proposals are kept in memory.
 * When SQLite is supplied, proposals persist across restarts.
 */
export class ProposalRepository {
  private readonly proposals =
    new Map<string, ProposalRecord>();

  constructor(
    private readonly database?:
      DatabaseSync,
  ) {}

  create(
    proposal: ProposalRecord,
  ): ProposalRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO proposals (
            id,
            client_id,
            client_name,
            service,
            requested_outcome,
            proposal,
            status,
            metadata_json,
            created_at,
            updated_at
          ) VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `)
        .run(
          proposal.id,
          proposal.clientId,
          proposal.clientName,
          proposal.service,
          proposal.requestedOutcome,
          proposal.proposal,
          proposal.status,
          JSON.stringify(
            proposal.metadata ?? {},
          ),
          proposal.createdAt,
          proposal.updatedAt,
        );

      return proposal;
    }

    this.proposals.set(
      proposal.id,
      proposal,
    );

    return proposal;
  }

  get(
    id: string,
  ): ProposalRecord {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              client_name,
              service,
              requested_outcome,
              proposal,
              status,
              metadata_json,
              created_at,
              updated_at
            FROM proposals
            WHERE id = ?
          `)
          .get(id) as
          | ProposalRow
          | undefined;

      if (!row) {
        throw new Error(
          `Proposal "${id}" was not found.`,
        );
      }

      return this.mapRow(row);
    }

    const proposal =
      this.proposals.get(id);

    if (!proposal) {
      throw new Error(
        `Proposal "${id}" was not found.`,
      );
    }

    return proposal;
  }

  list(): ProposalRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              client_name,
              service,
              requested_outcome,
              proposal,
              status,
              metadata_json,
              created_at,
              updated_at
            FROM proposals
            ORDER BY created_at DESC
          `)
          .all() as unknown as
          ProposalRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.proposals.values(),
    );
  }

  update(
    proposal: ProposalRecord,
  ): ProposalRecord {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            UPDATE proposals
            SET
              client_id = ?,
              client_name = ?,
              service = ?,
              requested_outcome = ?,
              proposal = ?,
              status = ?,
              metadata_json = ?,
              updated_at = ?
            WHERE id = ?
          `)
          .run(
            proposal.clientId,
            proposal.clientName,
            proposal.service,
            proposal.requestedOutcome,
            proposal.proposal,
            proposal.status,
            JSON.stringify(
              proposal.metadata ?? {},
            ),
            proposal.updatedAt,
            proposal.id,
          );

      if (result.changes === 0) {
        throw new Error(
          `Proposal "${proposal.id}" was not found.`,
        );
      }

      return proposal;
    }

    if (
      !this.proposals.has(
        proposal.id,
      )
    ) {
      throw new Error(
        `Proposal "${proposal.id}" was not found.`,
      );
    }

    this.proposals.set(
      proposal.id,
      proposal,
    );

    return proposal;
  }

  /**
   * Permanently deletes one proposal.
   */
  delete(
    id: string,
  ): void {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            DELETE FROM proposals
            WHERE id = ?
          `)
          .run(id);

      if (result.changes === 0) {
        throw new Error(
          `Proposal "${id}" was not found.`,
        );
      }

      return;
    }

    const deleted =
      this.proposals.delete(id);

    if (!deleted) {
      throw new Error(
        `Proposal "${id}" was not found.`,
      );
    }
  }

  /**
   * Converts one SQLite row into a proposal record.
   */
  private mapRow(
    row: ProposalRow,
  ): ProposalRecord {
    return {
      id: row.id,

      clientId:
        row.client_id,

      clientName:
        row.client_name,

      service:
        row.service,

      requestedOutcome:
        row.requested_outcome,

      proposal:
        row.proposal,

      status:
        row.status as ProposalStatus,

      metadata:
        this.parseMetadata(
          row.metadata_json,
        ),

      createdAt:
        row.created_at,

      updatedAt:
        row.updated_at,
    };
  }

  /**
   * Safely parses proposal metadata stored as JSON.
   */
  private parseMetadata(
    value: string,
  ): Record<string, unknown> {
    try {
      const parsed: unknown =
        JSON.parse(value);

      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as
          Record<string, unknown>;
      }
    } catch {
      // Invalid historical metadata is treated as empty.
    }

    return {};
  }
}