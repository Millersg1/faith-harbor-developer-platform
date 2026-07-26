/**
 * An in-app notification for one team member, within one tenant. Created by
 * the Notification dispatcher from activity events, or directly by a service.
 */
export interface NotificationRecord {
  id: string;
  organizationId: string;

  /** The team member this notification is for. */
  userId: string;

  /** Dotted type mirroring the source event, e.g. "invoice.paid". */
  type: string;

  title: string;
  body?: string;

  /** In-app destination, e.g. "/app#invoices". */
  link?: string;

  /** ISO timestamp when read, or undefined while unread. */
  readAt?: string;

  createdAt: string;
}

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}
