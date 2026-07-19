import { AIService } from "../AIService";
import type { RuntimeMessage } from "../runtime/RuntimeMessage";
import type { RuntimeSession } from "../runtime/RuntimeSession";
import type {
  CreateWorkerSessionInput,
} from "../runtime/RuntimeSessionManager";

/**
 * High-level service for interacting with AI workers.
 *
 * Applications should use this service instead of manually
 * creating runtime sessions.
 */
export class AIWorkerService {
  constructor(
    private readonly ai: AIService,
  ) {}

  /**
   * Starts a new worker session.
   */
  start(
    workerId: string,
    input: CreateWorkerSessionInput = {},
  ): RuntimeSession {
    return this.ai.createWorkerSession(
      workerId,
      input,
    );
  }

  /**
   * Sends work to an existing worker session.
   */
  async send(
    sessionId: string,
    content: string,
  ): Promise<RuntimeMessage> {
    return this.ai.sendRuntimeMessage(
      sessionId,
      content,
    );
  }

  /**
   * Returns the conversation history.
   */
  history(
    sessionId: string,
  ): readonly RuntimeMessage[] {
    return this.ai.getRuntimeMessages(
      sessionId,
    );
  }

  /**
   * Ends a worker session.
   */
  stop(
    sessionId: string,
  ): boolean {
    return this.ai.deleteRuntimeSession(
      sessionId,
    );
  }
}