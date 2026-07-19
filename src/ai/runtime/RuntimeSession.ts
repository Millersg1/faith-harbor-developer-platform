import type { AICapability } from "../Capability";

/**
 * Represents one ongoing interaction with the LLM runtime.
 */
export interface RuntimeSession {
  /**
   * Unique session identifier.
   */
  id: string;

  /**
   * Human-readable session name.
   */
  name: string;

  /**
   * Capability required for this session.
   */
  capability: AICapability;

  /**
   * Optional provider selected by the user.
   *
   * Use "auto" to allow the AI Director to choose.
   */
  provider?: string;

  /**
   * Optional model requested for the session.
   */
  model?: string;

  /**
   * Time the session was created.
   */
  createdAt: string;

  /**
   * Time the session was last updated.
   */
  updatedAt: string;

  /**
   * Additional workflow, client, or worker context.
   */
  metadata?: Record<string, unknown>;
}