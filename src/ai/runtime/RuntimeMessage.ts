/**
 * Roles supported by the LLM runtime conversation history.
 */
export type RuntimeMessageRole =
  | "system"
  | "user"
  | "assistant"
  | "tool";

/**
 * One message stored in a runtime session.
 */
export interface RuntimeMessage {
  /**
   * Unique message identifier.
   */
  id: string;

  /**
   * Session this message belongs to.
   */
  sessionId: string;

  /**
   * Message author role.
   */
  role: RuntimeMessageRole;

  /**
   * Message content.
   */
  content: string;

  /**
   * Time the message was created.
   */
  createdAt: string;

  /**
   * Provider that generated the message, when applicable.
   */
  provider?: string;

  /**
   * Model that generated the message, when applicable.
   */
  model?: string;

  /**
   * Optional tool name for tool messages.
   */
  toolName?: string;

  /**
   * Additional message context.
   */
  metadata?: Record<string, unknown>;
}