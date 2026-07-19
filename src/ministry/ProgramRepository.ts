import type {
  DatabaseSync,
} from "node:sqlite";

import type { ProgramRecord } from "./ProgramRecord";
import type { ProgramStatus } from "./ProgramStatus";

interface ProgramRow {
  id: string;
  client_id: string | null;
  name: string;
  category: string | null;
  status: string;
  leader: string | null;
  schedule: string | null;
  participants: number | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  notes: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * Stores and retrieves ministry program records.
 *
 * Without a database connection, programs are kept in memory.
 * When SQLite is supplied, programs persist across restarts.
 */
export class ProgramRepository {
  private readonly programs =
    new Map<string, ProgramRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    program: ProgramRecord,
  ): ProgramRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO ministry_programs (
            id,
            client_id,
            name,
            category,
            status,
            leader,
            schedule,
            participants,
            start_date,
            end_date,
            description,
            notes,
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
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `)
        .run(
          program.id,
          program.clientId ?? null,
          program.name,
          program.category ?? null,
          program.status,
          program.leader ?? null,
          program.schedule ?? null,
          program.participants ?? null,
          program.startDate ?? null,
          program.endDate ?? null,
          program.description ?? null,
          program.notes ?? null,
          JSON.stringify(
            program.metadata ?? {},
          ),
          program.createdAt,
          program.updatedAt,
        );

      return program;
    }

    this.programs.set(
      program.id,
      program,
    );

    return program;
  }

  get(
    id: string,
  ): ProgramRecord {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              name,
              category,
              status,
              leader,
              schedule,
              participants,
              start_date,
              end_date,
              description,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM ministry_programs
            WHERE id = ?
          `)
          .get(id) as
          | ProgramRow
          | undefined;

      if (!row) {
        throw new Error(
          `Program "${id}" was not found.`,
        );
      }

      return this.mapRow(row);
    }

    const program =
      this.programs.get(id);

    if (!program) {
      throw new Error(
        `Program "${id}" was not found.`,
      );
    }

    return program;
  }

  list(): ProgramRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              name,
              category,
              status,
              leader,
              schedule,
              participants,
              start_date,
              end_date,
              description,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM ministry_programs
            ORDER BY created_at DESC
          `)
          .all() as unknown as
          ProgramRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.programs.values(),
    );
  }

  findByClientId(
    clientId: string,
  ): ProgramRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              name,
              category,
              status,
              leader,
              schedule,
              participants,
              start_date,
              end_date,
              description,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM ministry_programs
            WHERE client_id = ?
            ORDER BY created_at DESC
          `)
          .all(clientId) as unknown as
          ProgramRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.programs.values(),
    ).filter(
      (program) =>
        program.clientId === clientId,
    );
  }

  update(
    program: ProgramRecord,
  ): ProgramRecord {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            UPDATE ministry_programs
            SET
              client_id = ?,
              name = ?,
              category = ?,
              status = ?,
              leader = ?,
              schedule = ?,
              participants = ?,
              start_date = ?,
              end_date = ?,
              description = ?,
              notes = ?,
              metadata_json = ?,
              updated_at = ?
            WHERE id = ?
          `)
          .run(
            program.clientId ?? null,
            program.name,
            program.category ?? null,
            program.status,
            program.leader ?? null,
            program.schedule ?? null,
            program.participants ?? null,
            program.startDate ?? null,
            program.endDate ?? null,
            program.description ?? null,
            program.notes ?? null,
            JSON.stringify(
              program.metadata ?? {},
            ),
            program.updatedAt,
            program.id,
          );

      if (result.changes === 0) {
        throw new Error(
          `Program "${program.id}" was not found.`,
        );
      }

      return program;
    }

    if (
      !this.programs.has(
        program.id,
      )
    ) {
      throw new Error(
        `Program "${program.id}" was not found.`,
      );
    }

    this.programs.set(
      program.id,
      program,
    );

    return program;
  }

  delete(
    id: string,
  ): void {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            DELETE FROM ministry_programs
            WHERE id = ?
          `)
          .run(id);

      if (result.changes === 0) {
        throw new Error(
          `Program "${id}" was not found.`,
        );
      }

      return;
    }

    const deleted =
      this.programs.delete(id);

    if (!deleted) {
      throw new Error(
        `Program "${id}" was not found.`,
      );
    }
  }

  /**
   * Converts one SQLite row into a program record.
   */
  private mapRow(
    row: ProgramRow,
  ): ProgramRecord {
    return {
      id: row.id,
      clientId:
        row.client_id ?? undefined,
      name: row.name,
      category:
        row.category ?? undefined,
      status:
        row.status as ProgramStatus,
      leader:
        row.leader ?? undefined,
      schedule:
        row.schedule ?? undefined,
      participants:
        row.participants ?? undefined,
      startDate:
        row.start_date ?? undefined,
      endDate:
        row.end_date ?? undefined,
      description:
        row.description ?? undefined,
      notes:
        row.notes ?? undefined,
      metadata:
        this.parseMetadata(
          row.metadata_json,
        ),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Safely parses program metadata stored as JSON.
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
