import { TenantScopedRepository } from "../../../tenancy/TenantScopedRepository";
import type {
  AiConversationMessageRecord,
  AiConversationRecord,
  AiMessageRole,
} from "./AiConversation";

interface ConversationRow {
  id: string;
  organization_id: string;
  user_id: string;
  ai_employee_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  organization_id: string;
  conversation_id: string;
  role: string;
  content: string;
  provider: string | null;
  model: string | null;
  metadata: unknown;
  created_at: string;
}

/**
 * Stores Command Center conversations and messages. Every query is scoped to
 * BOTH the tenant (fail-closed via {@link TenantScopedRepository.tenantId}) and
 * the owning user — so a conversation is private to its creator and can never
 * leak across users or organizations.
 */
export class AiConversationRepository extends TenantScopedRepository {
  private readonly conversations =
    new Map<
      string,
      AiConversationRecord
    >();
  private readonly messages =
    new Map<
      string,
      AiConversationMessageRecord
    >();

  async createConversation(
    record: Omit<
      AiConversationRecord,
      "organizationId"
    >,
  ): Promise<AiConversationRecord> {
    const full: AiConversationRecord = {
      ...record,
      organizationId: this.tenantId(),
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO ai_conversations
           (id, organization_id, user_id, ai_employee_id, title, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          full.id,
          full.organizationId,
          full.userId,
          full.aiEmployeeId ?? null,
          full.title,
          full.createdAt,
          full.updatedAt,
        ],
      );
      return full;
    }

    this.conversations.set(
      full.id,
      full,
    );
    return full;
  }

  async listConversations(
    userId: string,
    limit = 50,
  ): Promise<AiConversationRecord[]> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM ai_conversations
            WHERE organization_id = $1 AND user_id = $2
            ORDER BY updated_at DESC LIMIT $3`,
          [
            organizationId,
            userId,
            limit,
          ],
        );
      return (
        result.rows as unknown as ConversationRow[]
      ).map(mapConversation);
    }

    return [
      ...this.conversations.values(),
    ]
      .filter(
        (c) =>
          c.organizationId ===
            organizationId &&
          c.userId === userId,
      )
      .sort((a, b) =>
        a.updatedAt < b.updatedAt
          ? 1
          : -1,
      )
      .slice(0, limit);
  }

  /** A conversation the given user owns in this tenant, or undefined. */
  async getConversation(
    id: string,
    userId: string,
  ): Promise<
    AiConversationRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM ai_conversations WHERE id = $1 AND organization_id = $2 AND user_id = $3",
          [id, organizationId, userId],
        );
      const row = result
        .rows[0] as unknown as
        | ConversationRow
        | undefined;
      return row
        ? mapConversation(row)
        : undefined;
    }

    const record =
      this.conversations.get(id);
    return record &&
      record.organizationId ===
        organizationId &&
      record.userId === userId
      ? record
      : undefined;
  }

  async renameConversation(
    id: string,
    userId: string,
    title: string,
    updatedAt: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "UPDATE ai_conversations SET title = $4, updated_at = $5 WHERE id = $1 AND organization_id = $2 AND user_id = $3",
        [
          id,
          organizationId,
          userId,
          title,
          updatedAt,
        ],
      );
      return;
    }
    const record =
      this.conversations.get(id);
    if (
      record &&
      record.organizationId ===
        organizationId &&
      record.userId === userId
    ) {
      this.conversations.set(id, {
        ...record,
        title,
        updatedAt,
      });
    }
  }

  async touchConversation(
    id: string,
    updatedAt: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();
    if (this.db) {
      await this.db.query(
        "UPDATE ai_conversations SET updated_at = $3 WHERE id = $1 AND organization_id = $2",
        [id, organizationId, updatedAt],
      );
      return;
    }
    const record =
      this.conversations.get(id);
    if (
      record &&
      record.organizationId ===
        organizationId
    ) {
      this.conversations.set(id, {
        ...record,
        updatedAt,
      });
    }
  }

  async deleteConversation(
    id: string,
    userId: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      // Messages cascade via FK ON DELETE CASCADE.
      await this.db.query(
        "DELETE FROM ai_conversations WHERE id = $1 AND organization_id = $2 AND user_id = $3",
        [id, organizationId, userId],
      );
      return;
    }
    const record =
      this.conversations.get(id);
    if (
      record &&
      record.organizationId ===
        organizationId &&
      record.userId === userId
    ) {
      this.conversations.delete(id);
      for (const [
        mid,
        m,
      ] of this.messages) {
        if (m.conversationId === id) {
          this.messages.delete(mid);
        }
      }
    }
  }

  async addMessage(
    record: Omit<
      AiConversationMessageRecord,
      "organizationId"
    >,
  ): Promise<AiConversationMessageRecord> {
    const full: AiConversationMessageRecord =
      {
        ...record,
        organizationId:
          this.tenantId(),
      };

    if (this.db) {
      await this.db.query(
        `INSERT INTO ai_conversation_messages
           (id, organization_id, conversation_id, role, content, provider, model, metadata, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          full.id,
          full.organizationId,
          full.conversationId,
          full.role,
          full.content,
          full.provider ?? null,
          full.model ?? null,
          JSON.stringify(
            full.metadata ?? {},
          ),
          full.createdAt,
        ],
      );
      return full;
    }

    this.messages.set(full.id, full);
    return full;
  }

  async listMessages(
    conversationId: string,
    userId: string,
  ): Promise<
    AiConversationMessageRecord[]
  > {
    const organizationId =
      this.tenantId();
    // Confirm the user owns the conversation before returning messages.
    const owns =
      await this.getConversation(
        conversationId,
        userId,
      );
    if (!owns) {
      return [];
    }

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM ai_conversation_messages
            WHERE organization_id = $1 AND conversation_id = $2
            ORDER BY created_at ASC`,
          [
            organizationId,
            conversationId,
          ],
        );
      return (
        result.rows as unknown as MessageRow[]
      ).map(mapMessage);
    }

    return [...this.messages.values()]
      .filter(
        (m) =>
          m.organizationId ===
            organizationId &&
          m.conversationId ===
            conversationId,
      )
      .sort((a, b) =>
        a.createdAt < b.createdAt
          ? -1
          : 1,
      );
  }
}

function mapConversation(
  row: ConversationRow,
): AiConversationRecord {
  const record: AiConversationRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      userId: row.user_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  if (row.ai_employee_id) {
    record.aiEmployeeId =
      row.ai_employee_id;
  }
  return record;
}

function mapMessage(
  row: MessageRow,
): AiConversationMessageRecord {
  const record: AiConversationMessageRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      conversationId:
        row.conversation_id,
      role: row.role as AiMessageRole,
      content: row.content,
      createdAt: row.created_at,
    };
  if (row.provider)
    record.provider = row.provider;
  if (row.model)
    record.model = row.model;
  const meta = parseMeta(row.metadata);
  if (meta && Object.keys(meta).length) {
    record.metadata = meta;
  }
  return record;
}

function parseMeta(
  value: unknown,
): Record<string, unknown> | undefined {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<
      string,
      unknown
    >;
  }
  if (typeof value === "string") {
    try {
      const p = JSON.parse(value);
      return p &&
        typeof p === "object"
        ? (p as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
