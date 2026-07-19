import type { AIWorker } from "./AIWorker";

/**
 * Stores reusable AI worker definitions.
 */
export class AIWorkerRegistry {
  private readonly workers =
    new Map<string, AIWorker>();

  /**
   * Registers an AI worker.
   */
  register(worker: AIWorker): void {
    if (this.workers.has(worker.id)) {
      throw new Error(
        `AI worker "${worker.id}" is already registered.`,
      );
    }

    this.workers.set(
      worker.id,
      worker,
    );
  }

  /**
   * Returns an AI worker.
   */
  get(workerId: string): AIWorker {
    const worker =
      this.workers.get(workerId);

    if (!worker) {
      throw new Error(
        `AI worker "${workerId}" was not found.`,
      );
    }

    return worker;
  }

  /**
   * Returns all registered AI workers.
   */
  list(): readonly AIWorker[] {
    return Array.from(
      this.workers.values(),
    );
  }

  /**
   * Returns whether a worker is registered.
   */
  has(workerId: string): boolean {
    return this.workers.has(workerId);
  }

  /**
   * Removes an AI worker.
   */
  unregister(workerId: string): boolean {
    return this.workers.delete(workerId);
  }

  /**
   * Number of registered AI workers.
   */
  get size(): number {
    return this.workers.size;
  }
}