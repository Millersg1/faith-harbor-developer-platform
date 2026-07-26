import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type { NotificationRecord } from "./Notification";

interface NotificationRow {
  id: string;
  organization_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ListNotificationsOptions {
  unreadOnly?: boolean;
  limit?: number;
}

/**
 * Stores notifications, scoped to the acting tenant AND always further
 * filtered by user id — a team member can only ever see their own.
 */
export class NotificationRepository extends TenantScopedRepository {
  private readonly memory: NotificationRecord[] =
    [];

  async create(
    record: Omit<
      NotificationRecord,
      "organizationId"
    >,
  ): Promise<NotificationRecord> {
    const organizationId =
      this.tenantId();
    const full: NotificationRecord = {
      ...record,
      organizationId,
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO notifications
           (id, organization_id, user_id, type, title, body, link,
            read_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          full.id,
          full.organizationId,
          full.userId,
          full.type,
          full.title,
          full.body ?? null,
          full.link ?? null,
          full.readAt ?? null,
          full.createdAt,
        ],
      );

      return full;
    }

    this.memory.push(full);

    return full;
  }

  async listForUser(
    userId: string,
    options: ListNotificationsOptions = {},
  ): Promise<NotificationRecord[]> {
    const organizationId =
      this.tenantId();
    const limit = Math.min(
      Math.max(
        options.limit ?? 50,
        1,
      ),
      200,
    );

    if (this.db) {
      const clauses = [
        "organization_id = $1",
        "user_id = $2",
      ];

      if (options.unreadOnly) {
        clauses.push(
          "read_at IS NULL",
        );
      }

      const result =
        await this.db.query(
          `SELECT * FROM notifications
            WHERE ${clauses.join(" AND ")}
            ORDER BY created_at DESC
            LIMIT $3`,
          [
            organizationId,
            userId,
            limit,
          ],
        );

      return (
        result.rows as unknown as NotificationRow[]
      ).map(mapRow);
    }

    return this.memory
      .filter(
        (n) =>
          n.organizationId ===
            organizationId &&
          n.userId === userId &&
          (!options.unreadOnly ||
            !n.readAt),
      )
      .sort((a, b) =>
        a.createdAt < b.createdAt
          ? 1
          : -1,
      )
      .slice(0, limit);
  }

  async unreadCount(
    userId: string,
  ): Promise<number> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT COUNT(*)::int AS n FROM notifications
            WHERE organization_id = $1 AND user_id = $2 AND read_at IS NULL`,
          [organizationId, userId],
        );

      const row = result
        .rows[0] as unknown as
        | { n: number }
        | undefined;

      return row ? Number(row.n) : 0;
    }

    return this.memory.filter(
      (n) =>
        n.organizationId ===
          organizationId &&
        n.userId === userId &&
        !n.readAt,
    ).length;
  }

  /** Marks one notification read. Scoped to the tenant AND the user. */
  async markRead(
    userId: string,
    id: string,
    readAt: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE notifications SET read_at = $4
          WHERE id = $1 AND organization_id = $2 AND user_id = $3
            AND read_at IS NULL`,
        [
          id,
          organizationId,
          userId,
          readAt,
        ],
      );

      return;
    }

    const n = this.memory.find(
      (x) =>
        x.id === id &&
        x.organizationId ===
          organizationId &&
        x.userId === userId,
    );

    if (n && !n.readAt) {
      n.readAt = readAt;
    }
  }

  async markAllRead(
    userId: string,
    readAt: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE notifications SET read_at = $3
          WHERE organization_id = $1 AND user_id = $2 AND read_at IS NULL`,
        [
          organizationId,
          userId,
          readAt,
        ],
      );

      return;
    }

    for (const n of this.memory) {
      if (
        n.organizationId ===
          organizationId &&
        n.userId === userId &&
        !n.readAt
      ) {
        n.readAt = readAt;
      }
    }
  }
}

function mapRow(
  row: NotificationRow,
): NotificationRecord {
  const record: NotificationRecord = {
    id: row.id,
    organizationId:
      row.organization_id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    createdAt: row.created_at,
  };

  if (row.body) record.body = row.body;
  if (row.link) record.link = row.link;
  if (row.read_at)
    record.readAt = row.read_at;

  return record;
}
