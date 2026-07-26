import { randomUUID } from "node:crypto";

import {
  ActivityEventRepository,
  type ActivityQuery,
} from "./ActivityEventRepository";
import type {
  ActivityEventRecord,
  RecordActivityInput,
} from "./ActivityEvent";

/**
 * A consumer of activity events (e.g. the Notification dispatcher). Handlers
 * run inside the same tenant scope as the recording call and must never throw
 * back into the caller — a failed handler can't break the business action
 * that produced the event.
 */
export type ActivityHandler = (
  event: ActivityEventRecord,
) => Promise<void> | void;

/**
 * Records tenant activity and fans it out to registered handlers.
 *
 * This is the single funnel every module uses to say "X happened". The
 * Customer Journey Timeline reads {@link list}; the Notification Center and
 * (later) Workflows/Webhooks subscribe as handlers. Recording is best-effort
 * for the caller: if persistence or a handler fails, we swallow it so the
 * originating action still succeeds.
 */
export class ActivityService {
  private readonly handlers: ActivityHandler[] =
    [];

  constructor(
    private readonly repository =
      new ActivityEventRepository(),
    private readonly now: () => number = () =>
      Date.now(),
  ) {}

  /** Registers a fan-out handler (called for every recorded event). */
  subscribe(
    handler: ActivityHandler,
  ): void {
    this.handlers.push(handler);
  }

  /**
   * Records an event and dispatches it to handlers. Never throws — returns
   * the stored event, or undefined if it couldn't be persisted.
   */
  async record(
    input: RecordActivityInput,
  ): Promise<
    ActivityEventRecord | undefined
  > {
    let event: ActivityEventRecord;

    try {
      event =
        await this.repository.create({
          id: randomUUID(),
          type: input.type,
          actorType:
            input.actorType ?? "user",
          actorId: input.actorId,
          actorName: input.actorName,
          subjectType:
            input.subjectType,
          subjectId: input.subjectId,
          title: input.title,
          summary: input.summary,
          metadata: input.metadata,
          createdAt: new Date(
            this.now(),
          ).toISOString(),
        });
    } catch {
      // Recording is best-effort; never break the triggering action.
      return undefined;
    }

    for (const handler of this
      .handlers) {
      try {
        await handler(event);
      } catch {
        // A failing handler must not affect the others or the caller.
      }
    }

    return event;
  }

  async list(
    query: ActivityQuery = {},
  ): Promise<
    readonly ActivityEventRecord[]
  > {
    return this.repository.list(query);
  }
}
