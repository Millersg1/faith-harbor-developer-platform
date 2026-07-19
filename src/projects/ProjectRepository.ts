import type {
  DatabaseSync,
} from "node:sqlite";

import type { ProjectRecord } from "./ProjectRecord";
import type { ProjectStatus } from "./ProjectStatus";

interface ProjectRow {
  id: string;
  client_id: string;
  proposal_id: string | null;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
  notes: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * Stores and retrieves project records.
 *
 * Without a database connection, projects are kept in memory.
 * When SQLite is supplied, projects persist across restarts.
 */
export class ProjectRepository {
  private readonly projects =
    new Map<string, ProjectRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    project: ProjectRecord,
  ): ProjectRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO projects (
            id,
            client_id,
            proposal_id,
            name,
            description,
            status,
            start_date,
            due_date,
            completed_date,
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
            ?
          )
        `)
        .run(
          project.id,
          project.clientId,
          project.proposalId ?? null,
          project.name,
          project.description ?? null,
          project.status,
          project.startDate ?? null,
          project.dueDate ?? null,
          project.completedDate ?? null,
          project.notes ?? null,
          JSON.stringify(
            project.metadata ?? {},
          ),
          project.createdAt,
          project.updatedAt,
        );

      return project;
    }

    this.projects.set(
      project.id,
      project,
    );

    return project;
  }

  get(
    id: string,
  ): ProjectRecord {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              proposal_id,
              name,
              description,
              status,
              start_date,
              due_date,
              completed_date,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM projects
            WHERE id = ?
          `)
          .get(id) as
          | ProjectRow
          | undefined;

      if (!row) {
        throw new Error(
          `Project "${id}" was not found.`,
        );
      }

      return this.mapRow(row);
    }

    const project =
      this.projects.get(id);

    if (!project) {
      throw new Error(
        `Project "${id}" was not found.`,
      );
    }

    return project;
  }

  list(): ProjectRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              proposal_id,
              name,
              description,
              status,
              start_date,
              due_date,
              completed_date,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM projects
            ORDER BY created_at DESC
          `)
          .all() as unknown as
          ProjectRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.projects.values(),
    );
  }

  findByClientId(
    clientId: string,
  ): ProjectRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              proposal_id,
              name,
              description,
              status,
              start_date,
              due_date,
              completed_date,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM projects
            WHERE client_id = ?
            ORDER BY created_at DESC
          `)
          .all(clientId) as unknown as
          ProjectRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.projects.values(),
    ).filter(
      (project) =>
        project.clientId === clientId,
    );
  }

  update(
    project: ProjectRecord,
  ): ProjectRecord {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            UPDATE projects
            SET
              client_id = ?,
              proposal_id = ?,
              name = ?,
              description = ?,
              status = ?,
              start_date = ?,
              due_date = ?,
              completed_date = ?,
              notes = ?,
              metadata_json = ?,
              updated_at = ?
            WHERE id = ?
          `)
          .run(
            project.clientId,
            project.proposalId ?? null,
            project.name,
            project.description ?? null,
            project.status,
            project.startDate ?? null,
            project.dueDate ?? null,
            project.completedDate ?? null,
            project.notes ?? null,
            JSON.stringify(
              project.metadata ?? {},
            ),
            project.updatedAt,
            project.id,
          );

      if (result.changes === 0) {
        throw new Error(
          `Project "${project.id}" was not found.`,
        );
      }

      return project;
    }

    if (
      !this.projects.has(
        project.id,
      )
    ) {
      throw new Error(
        `Project "${project.id}" was not found.`,
      );
    }

    this.projects.set(
      project.id,
      project,
    );

    return project;
  }

  delete(
    id: string,
  ): void {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            DELETE FROM projects
            WHERE id = ?
          `)
          .run(id);

      if (result.changes === 0) {
        throw new Error(
          `Project "${id}" was not found.`,
        );
      }

      return;
    }

    const deleted =
      this.projects.delete(id);

    if (!deleted) {
      throw new Error(
        `Project "${id}" was not found.`,
      );
    }
  }

  /**
   * Converts one SQLite row into a project record.
   */
  private mapRow(
    row: ProjectRow,
  ): ProjectRecord {
    return {
      id: row.id,
      clientId: row.client_id,
      proposalId:
        row.proposal_id ?? undefined,
      name: row.name,
      description:
        row.description ?? undefined,
      status:
        row.status as ProjectStatus,
      startDate:
        row.start_date ?? undefined,
      dueDate:
        row.due_date ?? undefined,
      completedDate:
        row.completed_date ?? undefined,
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
   * Safely parses project metadata stored as JSON.
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