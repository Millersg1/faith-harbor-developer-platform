import type {
  DatabaseSync,
} from "node:sqlite";

import type {
  AutomationDraft,
  AutomationStatus,
  AutomationTrigger,
} from "./AutomationTypes";

interface AutomationRow {
  id: string;
  trigger: string;
  title: string;
  to_address: string;
  subject: string;
  body: string;
  status: string;
  related_type: string;
  related_id: string;
  client_id: string | null;
  email_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

/**
 * Stores automation drafts.
 *
 * Without a database connection, drafts are kept in memory.
 * When SQLite is supplied, drafts persist across restarts so a
 * pending proposal is never lost before a human reviews it.
 */
export class AutomationRepository {
  private readonly drafts =
    new Map<string, AutomationDraft>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    draft: AutomationDraft,
  ): AutomationDraft {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO automation_drafts (
            id,
            trigger,
            title,
            to_address,
            subject,
            body,
            status,
            related_type,
            related_id,
            client_id,
            email_id,
            created_at,
            resolved_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
        `)
        .run(
          draft.id,
          draft.trigger,
          draft.title,
          draft.to,
          draft.subject,
          draft.body,
          draft.status,
          draft.relatedType,
          draft.relatedId,
          draft.clientId ?? null,
          draft.emailId ?? null,
          draft.createdAt,
          draft.resolvedAt ?? null,
        );

      return draft;
    }

    this.drafts.set(
      draft.id,
      draft,
    );

    return draft;
  }

  list(): AutomationDraft[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              trigger,
              title,
              to_address,
              subject,
              body,
              status,
              related_type,
              related_id,
              client_id,
              email_id,
              created_at,
              resolved_at
            FROM automation_drafts
            ORDER BY created_at DESC
          `)
          .all() as unknown as
          AutomationRow[];

      return rows.map(
        (row) => this.mapRow(row),
      );
    }

    return Array.from(
      this.drafts.values(),
    ).sort((a, b) =>
      b.createdAt.localeCompare(
        a.createdAt,
      ),
    );
  }

  get(
    id: string,
  ): AutomationDraft {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT
              id,
              trigger,
              title,
              to_address,
              subject,
              body,
              status,
              related_type,
              related_id,
              client_id,
              email_id,
              created_at,
              resolved_at
            FROM automation_drafts
            WHERE id = ?
          `)
          .get(id) as unknown as
          AutomationRow | undefined;

      if (!row) {
        throw new Error(
          "Automation draft not found.",
        );
      }

      return this.mapRow(row);
    }

    const draft =
      this.drafts.get(id);

    if (!draft) {
      throw new Error(
        "Automation draft not found.",
      );
    }

    return draft;
  }

  update(
    draft: AutomationDraft,
  ): AutomationDraft {
    if (this.database) {
      this.database
        .prepare(`
          UPDATE automation_drafts
          SET
            status = ?,
            email_id = ?,
            resolved_at = ?
          WHERE id = ?
        `)
        .run(
          draft.status,
          draft.emailId ?? null,
          draft.resolvedAt ?? null,
          draft.id,
        );

      return draft;
    }

    this.drafts.set(
      draft.id,
      draft,
    );

    return draft;
  }

  /**
   * Updates only the body of a draft (used when AI personalizes it
   * after creation). Leaves status and all other fields untouched.
   */
  updateBody(
    id: string,
    body: string,
  ): void {
    if (this.database) {
      this.database
        .prepare(`
          UPDATE automation_drafts
          SET body = ?
          WHERE id = ?
        `)
        .run(body, id);

      return;
    }

    const draft = this.drafts.get(id);

    if (draft) {
      this.drafts.set(id, {
        ...draft,
        body,
      });
    }
  }

  private mapRow(
    row: AutomationRow,
  ): AutomationDraft {
    return {
      id: row.id,
      trigger:
        row.trigger as AutomationTrigger,
      title: row.title,
      to: row.to_address,
      subject: row.subject,
      body: row.body,
      status:
        row.status as AutomationStatus,
      relatedType: row.related_type,
      relatedId: row.related_id,
      clientId:
        row.client_id ?? undefined,
      emailId:
        row.email_id ?? undefined,
      createdAt: row.created_at,
      resolvedAt:
        row.resolved_at ?? undefined,
    };
  }
}
