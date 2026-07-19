import type { AICapability } from "../Capability";

/**
 * Defines one reusable AI worker in Faith Harbor OS.
 *
 * A worker describes behavior and responsibility.
 * Runtime sessions represent individual conversations
 * with that worker.
 */
export interface AIWorker {
  /**
   * Unique worker identifier.
   */
  id: string;

  /**
   * Human-readable worker name.
   */
  name: string;

  /**
   * Description of the worker's responsibility.
   */
  description: string;

  /**
   * AI capabilities this worker may perform.
   */
  capabilities: readonly AICapability[];

  /**
   * System instructions applied to every session
   * created for this worker.
   */
  systemPrompt: string;

  /**
   * Optional preferred provider.
   *
   * Use "auto" to allow the Director to choose.
   */
  preferredProvider?: string;

  /**
   * Optional preferred model.
   */
  preferredModel?: string;

  /**
   * Whether work produced by this worker requires
   * human approval before delivery.
   */
  requiresApproval: boolean;

  /**
   * Tool names this worker is permitted to use.
   */
  allowedTools: readonly string[];

  /**
   * Additional worker configuration.
   */
  metadata?: Record<string, unknown>;
}