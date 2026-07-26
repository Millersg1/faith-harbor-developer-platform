/**
 * A tenant calendar event. Times are stored in UTC as ISO-8601 strings and
 * presented in the viewer's timezone by the UI. Events can link to a record
 * (client, project, invoice due date, …) via subjectType/subjectId.
 */
export interface CalendarEventRecord {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  location?: string;

  /** ISO-8601 UTC start. */
  startAt: string;
  /** ISO-8601 UTC end, or undefined. */
  endAt?: string;
  allDay: boolean;

  subjectType?: string;
  subjectId?: string;

  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCalendarEventRequest {
  title: string;
  description?: string;
  location?: string;
  startAt: string;
  endAt?: string;
  allDay?: boolean;
  subjectType?: string;
  subjectId?: string;
  createdBy?: string;
}

export interface UpdateCalendarEventRequest {
  title?: string;
  description?: string;
  location?: string;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
}
