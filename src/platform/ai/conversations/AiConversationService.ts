import { randomUUID } from "node:crypto";

import {
  deriveConversationTitle,
  type AiConversationMessageRecord,
  type AiConversationRecord,
  type AiMessageRole,
} from "./AiConversation";
import { AiConversationRepository } from "./AiConversationRepository";

/**
 * Manages the acting user's Command Center conversations. Every method takes
 * the acting `userId` and passes it to the tenant+user-scoped repository, so a
 * user can only ever read or change their own conversations.
 */
export class AiConversationService {
  constructor(
    private readonly repository = new AiConversationRepository(),
  ) {}

  async create(
    userId: string,
    input: {
      title?: string;
      aiEmployeeId?: string;
    } = {},
  ): Promise<AiConversationRecord> {
    const now =
      new Date().toISOString();
    return this.repository.createConversation(
      {
        id: randomUUID(),
        userId,
        aiEmployeeId:
          input.aiEmployeeId,
        title:
          (input.title || "").trim() ||
          "New conversation",
        createdAt: now,
        updatedAt: now,
      },
    );
  }

  async list(
    userId: string,
  ): Promise<AiConversationRecord[]> {
    return this.repository.listConversations(
      userId,
    );
  }

  async get(
    id: string,
    userId: string,
  ): Promise<
    AiConversationRecord | undefined
  > {
    return this.repository.getConversation(
      id,
      userId,
    );
  }

  async messages(
    conversationId: string,
    userId: string,
  ): Promise<
    AiConversationMessageRecord[]
  > {
    return this.repository.listMessages(
      conversationId,
      userId,
    );
  }

  async rename(
    id: string,
    userId: string,
    title: string,
  ): Promise<boolean> {
    const owns =
      await this.repository.getConversation(
        id,
        userId,
      );
    if (!owns) {
      return false;
    }
    await this.repository.renameConversation(
      id,
      userId,
      title.trim() ||
        owns.title,
      new Date().toISOString(),
    );
    return true;
  }

  async remove(
    id: string,
    userId: string,
  ): Promise<void> {
    await this.repository.deleteConversation(
      id,
      userId,
    );
  }

  /**
   * Ensures a conversation exists for this turn: returns the given one (if the
   * user owns it) or creates a new one titled from the first message. Then
   * appends the message. Returns the conversation id.
   */
  async recordMessage(
    userId: string,
    input: {
      conversationId?: string;
      role: AiMessageRole;
      content: string;
      firstMessageForTitle?: string;
      aiEmployeeId?: string;
      provider?: string;
      model?: string;
      metadata?: Record<
        string,
        unknown
      >;
    },
  ): Promise<string> {
    let conversationId =
      input.conversationId;
    if (conversationId) {
      const owns =
        await this.repository.getConversation(
          conversationId,
          userId,
        );
      if (!owns) {
        conversationId = undefined;
      }
    }
    if (!conversationId) {
      const created =
        await this.create(userId, {
          title:
            deriveConversationTitle(
              input.firstMessageForTitle ??
                input.content,
            ),
          aiEmployeeId:
            input.aiEmployeeId,
        });
      conversationId = created.id;
    }

    const now =
      new Date().toISOString();
    await this.repository.addMessage({
      id: randomUUID(),
      conversationId,
      role: input.role,
      content: input.content,
      provider: input.provider,
      model: input.model,
      metadata: input.metadata,
      createdAt: now,
    });
    await this.repository.touchConversation(
      conversationId,
      now,
    );
    return conversationId;
  }
}
