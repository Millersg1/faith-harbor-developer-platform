import type { AIDecisionRecord } from "./AIDecisionRecord";

interface DatabaseStatement {
  all(...parameters: unknown[]): unknown[];
  run(...parameters: unknown[]): unknown;
}

export interface DecisionLogDatabase {
  prepare(sql: string): DatabaseStatement;
}

/**
 * Stores AI Director routing decisions.
 *
 * When a database connection is supplied, existing decisions
 * are loaded at startup and new decisions are persisted.
 */
export class AIDecisionLog {
  private readonly decisions: AIDecisionRecord[] =
    [];

  constructor(
    private readonly database?: DecisionLogDatabase,
  ) {
    this.loadPersistedDecisions();
  }

  /**
   * Records one decision.
   */
  record(
    decision: AIDecisionRecord,
  ): void {
    this.decisions.push(decision);

    this.database
      ?.prepare(`
        INSERT INTO ai_decisions (
          id,
          timestamp,
          capability,
          provider_id,
          provider_name,
          reason,
          confidence,
          model
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        decision.id,
        decision.timestamp,
        decision.capability,
        decision.providerId,
        decision.providerName,
        decision.reason,
        decision.confidence,
        decision.model,
      );
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
    return this.decisions
      .slice(-count)
      .reverse();
  }

  /**
   * Removes every decision.
   */
  clear(): void {
    this.decisions.length = 0;

    this.database
      ?.prepare(`
        DELETE FROM ai_decisions
      `)
      .run();
  }

  /**
   * Number of recorded decisions.
   */
  get size(): number {
    return this.decisions.length;
  }

  /**
   * Loads previously recorded decisions from SQLite.
   */
  private loadPersistedDecisions(): void {
    if (!this.database) {
      return;
    }

    const rows = this.database
      .prepare(`
        SELECT
          id,
          timestamp,
          capability,
          provider_id,
          provider_name,
          reason,
          confidence,
          model
        FROM ai_decisions
        ORDER BY timestamp ASC
      `)
      .all() as Array<{
        id: string;
        timestamp: string;
        capability: string;
        provider_id: string;
        provider_name: string;
        reason: string;
        confidence: number;
        model: string;
      }>;

    for (const row of rows) {
      this.decisions.push({
        id: row.id,
        timestamp: row.timestamp,
        capability: row.capability,
        providerId: row.provider_id,
        providerName: row.provider_name,
        reason: row.reason,
        confidence: row.confidence,
        model: row.model,
      });
    }
  }
}