import { randomUUID } from "node:crypto";

import {
  CalendarEventRepository,
  type CalendarQuery,
} from "./CalendarEventRepository";
import type {
  CalendarEventRecord,
  CreateCalendarEventRequest,
  UpdateCalendarEventRequest,
} from "./CalendarEvent";

export class CalendarValidationError extends Error {}

/**
 * Manages a tenant's calendar events. Times are validated as ISO-8601 and
 * normalized to UTC on the way in, so storage is timezone-safe and range
 * queries are correct.
 */
export class CalendarService {
  private readonly now: () => number;

  constructor(
    private readonly repository =
      new CalendarEventRepository(),
    options: { now?: () => number } = {},
  ) {
    this.now =
      options.now ??
      (() => Date.now());
  }

  async create(
    request: CreateCalendarEventRequest,
  ): Promise<CalendarEventRecord> {
    const title =
      request.title.trim();

    if (!title) {
      throw new CalendarValidationError(
        "An event needs a title.",
      );
    }

    const startAt = toUtcIso(
      request.startAt,
    );

    if (!startAt) {
      throw new CalendarValidationError(
        "A valid start date/time is required.",
      );
    }

    const endAt = request.endAt
      ? toUtcIso(request.endAt)
      : undefined;

    if (
      request.endAt &&
      !endAt
    ) {
      throw new CalendarValidationError(
        "The end date/time is invalid.",
      );
    }

    if (
      endAt &&
      endAt < startAt
    ) {
      throw new CalendarValidationError(
        "The event can't end before it starts.",
      );
    }

    const nowIso = new Date(
      this.now(),
    ).toISOString();

    return this.repository.create({
      id: randomUUID(),
      title,
      description:
        request.description?.trim() ||
        undefined,
      location:
        request.location?.trim() ||
        undefined,
      startAt,
      endAt,
      allDay: Boolean(
        request.allDay,
      ),
      subjectType:
        request.subjectType,
      subjectId: request.subjectId,
      createdBy: request.createdBy,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  async list(
    query: CalendarQuery = {},
  ): Promise<
    readonly CalendarEventRecord[]
  > {
    const from = query.from
      ? toUtcIso(query.from)
      : undefined;
    const to = query.to
      ? toUtcIso(query.to)
      : undefined;

    return this.repository.list({
      from: from ?? undefined,
      to: to ?? undefined,
    });
  }

  async get(
    id: string,
  ): Promise<CalendarEventRecord> {
    const event =
      await this.repository.get(id);

    if (!event) {
      throw new Error(
        "Event not found.",
      );
    }

    return event;
  }

  async update(
    id: string,
    changes: UpdateCalendarEventRequest,
  ): Promise<CalendarEventRecord> {
    const event = await this.get(id);

    const startAt =
      changes.startAt !== undefined
        ? toUtcIso(changes.startAt)
        : event.startAt;

    if (!startAt) {
      throw new CalendarValidationError(
        "A valid start date/time is required.",
      );
    }

    let endAt = event.endAt;
    if (changes.endAt !== undefined) {
      endAt = changes.endAt
        ? toUtcIso(changes.endAt) ||
          undefined
        : undefined;
    }

    if (
      endAt &&
      endAt < startAt
    ) {
      throw new CalendarValidationError(
        "The event can't end before it starts.",
      );
    }

    const updated: CalendarEventRecord =
      {
        ...event,
        title:
          changes.title?.trim() ||
          event.title,
        description:
          changes.description !==
          undefined
            ? changes.description.trim() ||
              undefined
            : event.description,
        location:
          changes.location !==
          undefined
            ? changes.location.trim() ||
              undefined
            : event.location,
        startAt,
        endAt,
        allDay:
          changes.allDay ??
          event.allDay,
        updatedAt: new Date(
          this.now(),
        ).toISOString(),
      };

    return this.repository.update(
      updated,
    );
  }

  async delete(
    id: string,
  ): Promise<void> {
    await this.get(id);
    await this.repository.delete(id);
  }
}

/**
 * Parses a date/time and returns its UTC ISO-8601 form, or undefined if it
 * isn't a valid date. Accepts anything Date can parse (ISO, with or without
 * timezone); a value without a timezone is interpreted by the runtime and
 * normalized to UTC here.
 */
function toUtcIso(
  value: string,
): string | undefined {
  const ms = Date.parse(value);

  if (Number.isNaN(ms)) {
    return undefined;
  }

  return new Date(ms).toISOString();
}
