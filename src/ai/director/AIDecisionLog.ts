import type { AIDecisionRecord } from "./AIDecisionRecord";

/**
 * Stores AI Director routing decisions.
 */
export class AIDecisionLog {
  private readonly decisions: AIDecisionRecord[] =
    [];

  /**
   * Records one decision.
   */
  record(
    decision: AIDecisionRecord,
  ): void {
    this.decisions.push(decision);
  }

  /**
   * Returns every recorded decision.
   */
  getAll():
    readonly AIDecisionRecord[] {
    return this.decisions;
  }

  /**
   * Returns the most recent decisions.
   */
  latest(
    count = 25,
  ): readonly AIDecisionRecord[] {
    return this.decisions.slice(-count).reverse();
  }

  /**
   * Removes every decision.
   */
  clear(): void {
    this.decisions.length = 0;
  }

  /**
   * Number of recorded decisions.
   */
  get size(): number {
    return this.decisions.length;
  }
}