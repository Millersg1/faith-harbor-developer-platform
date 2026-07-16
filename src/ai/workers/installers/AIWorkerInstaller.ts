import type { AIWorkerRegistry } from "../AIWorkerRegistry";

/**
 * Installs one or more AI workers into the worker registry.
 */
export interface AIWorkerInstaller {
  /**
   * Registers supported AI workers.
   */
  install(
    registry: AIWorkerRegistry,
  ): void | Promise<void>;
}