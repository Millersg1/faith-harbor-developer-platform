import { randomUUID } from "node:crypto";

import type { AICapability } from "../Capability";
import type { AIWorker } from "../workers/AIWorker";
import type {
  RuntimeMessage,
  RuntimeMessageRole,
} from "./RuntimeMessage";
import type { RuntimeSession } from "./RuntimeSession";

export interface CreateRuntimeSessionInput {
  name: string;
  capability: AICapability;
  provider?: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateWorkerSessionInput {
  name?: string;
  capability?: AICapability;
  metadata?: Record<string, unknown>;
}

export interface AddRuntimeMessageInput {
  role: RuntimeMessageRole;
  content: string;
  provider?: string;
  model?: string;
  toolName?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Creates and manages LLM runtime sessions and messages.
 */
export class RuntimeSessionManager {
  private readonly sessions =
    new Map<string, RuntimeSession>();

  private readonly messages =
    new Map<string, RuntimeMessage[]>();

  /**
   * Creates a new runtime session.
   */
  create(
    input: CreateRuntimeSessionInput,
  ): RuntimeSession {
    const now = new Date().toISOString();

    const session: RuntimeSession = {
      id: randomUUID(),
      name: input.name,
      capability: input.capability,
      createdAt: now,
      updatedAt: now,
    };

    if (input.provider) {
      session.provider = input.provider;
    }

    if (input.model) {
      session.model = input.model;
    }

    if (input.metadata) {
      session.metadata = input.metadata;
    }

    this.sessions.set(
      session.id,
      session,
    );

    this.messages.set(
      session.id,
      [],
    );

    return session;
  }

  /**
   * Creates a runtime session configured from an AI worker.
   *
   * The worker's system prompt is automatically added as
   * the first message in the conversation.
   */
  createFromWorker(
    worker: AIWorker,
    input: CreateWorkerSessionInput = {},
  ): RuntimeSession {
    const capability =
      input.capability ??
      worker.capabilities[0];

    if (!capability) {
      throw new Error(
        `AI worker "${worker.id}" has no supported capabilities.`,
      );
    }

    if (
      !worker.capabilities.includes(
        capability,
      )
    ) {
      throw new Error(
        `AI worker "${worker.id}" does not support capability "${capability}".`,
      );
    }

    const session = this.create({
      name:
        input.name ??
        worker.name,
      capability,
      provider:
        worker.preferredProvider ??
        "auto",
      model:
        worker.preferredModel,
      metadata: {
        ...worker.metadata,
        ...input.metadata,
        workerId: worker.id,
        workerName: worker.name,
        requiresApproval:
          worker.requiresApproval,
        allowedTools: [
          ...worker.allowedTools,
        ],
      },
    });

    this.addMessage(
      session.id,
      {
        role: "system",
        content:
          worker.systemPrompt,
        metadata: {
          workerId: worker.id,
        },
      },
    );

    return this.get(session.id);
  }

  /**
   * Returns a runtime session.
   */
  get(
    sessionId: string,
  ): RuntimeSession {
    const session =
      this.sessions.get(sessionId);

    if (!session) {
      throw new Error(
        `Runtime session "${sessionId}" was not found.`,
      );
    }

    return session;
  }

  /**
   * Returns all runtime sessions.
   */
  list(): readonly RuntimeSession[] {
    return Array.from(
      this.sessions.values(),
    );
  }

  /**
   * Adds a message to a runtime session.
   */
  addMessage(
    sessionId: string,
    input: AddRuntimeMessageInput,
  ): RuntimeMessage {
    const session = this.get(sessionId);

    if (
      input.content.trim().length === 0
    ) {
      throw new Error(
        "Runtime message content cannot be empty.",
      );
    }

    const createdAt =
      new Date().toISOString();

    const message: RuntimeMessage = {
      id: randomUUID(),
      sessionId,
      role: input.role,
      content: input.content.trim(),
      createdAt,
    };

    if (input.provider) {
      message.provider =
        input.provider;
    }

    if (input.model) {
      message.model =
        input.model;
    }

    if (input.toolName) {
      message.toolName =
        input.toolName;
    }

    if (input.metadata) {
      message.metadata =
        input.metadata;
    }

    const sessionMessages =
      this.messages.get(sessionId);

    if (!sessionMessages) {
      throw new Error(
        `Runtime messages were not initialized for session "${sessionId}".`,
      );
    }

    sessionMessages.push(message);

    this.sessions.set(
      sessionId,
      {
        ...session,
        updatedAt: createdAt,
      },
    );

    return message;
  }

  /**
   * Returns every message in a runtime session.
   */
  getMessages(
    sessionId: string,
  ): readonly RuntimeMessage[] {
    this.get(sessionId);

    return (
      this.messages.get(sessionId) ??
      []
    );
  }

  /**
   * Deletes a runtime session and all of its messages.
   */
  delete(sessionId: string): boolean {
    const removed =
      this.sessions.delete(sessionId);

    if (removed) {
      this.messages.delete(sessionId);
    }

    return removed;
  }

  /**
   * Returns the number of active runtime sessions.
   */
  get size(): number {
    return this.sessions.size;
  }
}