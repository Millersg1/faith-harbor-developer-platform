import type { DatabaseSync } from "node:sqlite";

import type {
  EnrollmentRecord,
  SequenceRecord,
  SequenceStep,
} from "./SequenceTypes";

interface SequenceRow {
  id: string;
  name: string;
  brand_id: string | null;
  steps_json: string;
  created_at: string;
}

interface EnrollmentRow {
  id: string;
  sequence_id: string;
  email: string;
  name: string | null;
  client_id: string | null;
  position: number;
  status: string;
  next_send_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores sequences and enrollments. In memory without a database;
 * persistent with SQLite.
 */
export class SequenceRepository {
  private readonly sequences =
    new Map<string, SequenceRecord>();

  private readonly enrollments =
    new Map<string, EnrollmentRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  createSequence(
    record: SequenceRecord,
  ): SequenceRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO sequences (
            id, name, brand_id, steps_json, created_at
          ) VALUES (?, ?, ?, ?, ?)
        `)
        .run(
          record.id,
          record.name,
          record.brandId ?? null,
          JSON.stringify(record.steps),
          record.createdAt,
        );

      return record;
    }

    this.sequences.set(
      record.id,
      record,
    );

    return record;
  }

  getSequence(
    id: string,
  ): SequenceRecord | undefined {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT id, name, brand_id, steps_json, created_at
            FROM sequences
            WHERE id = ?
          `)
          .get(id) as unknown as
          SequenceRow | undefined;

      return row
        ? this.mapSequence(row)
        : undefined;
    }

    return this.sequences.get(id);
  }

  listSequences(): SequenceRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT id, name, brand_id, steps_json, created_at
            FROM sequences
            ORDER BY created_at DESC
          `)
          .all() as unknown as
          SequenceRow[];

      return rows.map((row) =>
        this.mapSequence(row),
      );
    }

    return Array.from(
      this.sequences.values(),
    );
  }

  createEnrollment(
    record: EnrollmentRecord,
  ): EnrollmentRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO sequence_enrollments (
            id, sequence_id, email, name, client_id,
            position, status, next_send_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          record.id,
          record.sequenceId,
          record.email,
          record.name ?? null,
          record.clientId ?? null,
          record.position,
          record.status,
          record.nextSendAt ?? null,
          record.createdAt,
          record.updatedAt,
        );

      return record;
    }

    this.enrollments.set(
      record.id,
      record,
    );

    return record;
  }

  updateEnrollment(
    record: EnrollmentRecord,
  ): EnrollmentRecord {
    if (this.database) {
      this.database
        .prepare(`
          UPDATE sequence_enrollments
          SET position = ?, status = ?, next_send_at = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(
          record.position,
          record.status,
          record.nextSendAt ?? null,
          record.updatedAt,
          record.id,
        );

      return record;
    }

    this.enrollments.set(
      record.id,
      record,
    );

    return record;
  }

  /**
   * Returns an existing active enrollment for a contact/sequence pair,
   * so re-enrolling the same buyer is idempotent.
   */
  findActiveEnrollment(
    sequenceId: string,
    email: string,
  ): EnrollmentRecord | undefined {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT id, sequence_id, email, name, client_id,
                   position, status, next_send_at, created_at, updated_at
            FROM sequence_enrollments
            WHERE sequence_id = ? AND email = ? AND status = 'active'
            LIMIT 1
          `)
          .get(
            sequenceId,
            email,
          ) as unknown as
          EnrollmentRow | undefined;

      return row
        ? this.mapEnrollment(row)
        : undefined;
    }

    for (const record of this.enrollments.values()) {
      if (
        record.sequenceId ===
          sequenceId &&
        record.email === email &&
        record.status === "active"
      ) {
        return record;
      }
    }

    return undefined;
  }

  /**
   * Returns active enrollments whose next step is due at or before the
   * given moment.
   */
  listDueEnrollments(
    now: string,
  ): EnrollmentRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT id, sequence_id, email, name, client_id,
                   position, status, next_send_at, created_at, updated_at
            FROM sequence_enrollments
            WHERE status = 'active'
              AND next_send_at IS NOT NULL
              AND next_send_at <= ?
            ORDER BY next_send_at ASC
          `)
          .all(now) as unknown as
          EnrollmentRow[];

      return rows.map((row) =>
        this.mapEnrollment(row),
      );
    }

    return Array.from(
      this.enrollments.values(),
    )
      .filter(
        (record) =>
          record.status === "active" &&
          record.nextSendAt !==
            undefined &&
          record.nextSendAt <= now,
      )
      .sort((a, b) =>
        (a.nextSendAt ?? "").localeCompare(
          b.nextSendAt ?? "",
        ),
      );
  }

  listEnrollments(): EnrollmentRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT id, sequence_id, email, name, client_id,
                   position, status, next_send_at, created_at, updated_at
            FROM sequence_enrollments
            ORDER BY created_at DESC
          `)
          .all() as unknown as
          EnrollmentRow[];

      return rows.map((row) =>
        this.mapEnrollment(row),
      );
    }

    return Array.from(
      this.enrollments.values(),
    );
  }

  private mapSequence(
    row: SequenceRow,
  ): SequenceRecord {
    const record: SequenceRecord = {
      id: row.id,
      name: row.name,
      steps: this.parseSteps(
        row.steps_json,
      ),
      createdAt: row.created_at,
    };

    if (row.brand_id) {
      record.brandId = row.brand_id;
    }

    return record;
  }

  private parseSteps(
    value: string,
  ): SequenceStep[] {
    try {
      const parsed: unknown =
        JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed as SequenceStep[];
      }
    } catch {
      // A corrupt row yields an empty sequence rather than a crash.
    }

    return [];
  }

  private mapEnrollment(
    row: EnrollmentRow,
  ): EnrollmentRecord {
    const record: EnrollmentRecord = {
      id: row.id,
      sequenceId: row.sequence_id,
      email: row.email,
      position: row.position,
      status:
        row.status === "completed"
          ? "completed"
          : "active",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    if (row.name) {
      record.name = row.name;
    }

    if (row.client_id) {
      record.clientId = row.client_id;
    }

    if (row.next_send_at) {
      record.nextSendAt =
        row.next_send_at;
    }

    return record;
  }
}
