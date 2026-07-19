import type {
  DatabaseSync,
} from "node:sqlite";

import type {
  EmailRecord,
  EmailStatus,
} from "./EmailTypes";

interface EmailRow {
  id: string;
  from_address: string;
  to_address: string;
  subject: string;
  body: string;
  status: string;
  provider: string;
  error: string | null;
  client_id: string | null;
  created_at: string;
}

/**
 * Stores the email outbox.
 *
 * Without a database connection, records are kept in memory.
 * When SQLite is supplied, the outbox persists across restarts.
 */
export class EmailRepository {
  private readonly emails =
    new Map<string, EmailRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    email: EmailRecord,
  ): EmailRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO emails (
            id,
            from_address,
            to_address,
            subject,
            body,
            status,
            provider,
            error,
            client_id,
            created_at
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
          email.id,
          email.from,
          email.to,
          email.subject,
          email.body,
          email.status,
          email.provider,
          email.error ?? null,
          email.clientId ?? null,
          email.createdAt,
        );

      return email;
    }

    this.emails.set(
      email.id,
      email,
    );

    return email;
  }

  list(): EmailRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              from_address,
              to_address,
              subject,
              body,
              status,
              provider,
              error,
              client_id,
              created_at
            FROM emails
            ORDER BY created_at DESC
          `)
          .all() as unknown as
          EmailRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.emails.values(),
    );
  }

  /**
   * Converts one SQLite row into an email record.
   */
  private mapRow(
    row: EmailRow,
  ): EmailRecord {
    return {
      id: row.id,
      from: row.from_address,
      to: row.to_address,
      subject: row.subject,
      body: row.body,
      status:
        row.status as EmailStatus,
      provider: row.provider,
      error:
        row.error ?? undefined,
      clientId:
        row.client_id ?? undefined,
      createdAt: row.created_at,
    };
  }
}
