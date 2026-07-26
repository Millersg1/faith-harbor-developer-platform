import type { ActivityEventRecord } from "../events/ActivityEvent";
import type { ActivityHandler } from "../events/ActivityService";
import type { NotificationService } from "./NotificationService";

/**
 * Event types that should raise an in-app notification. Not every activity
 * event is notification-worthy (e.g. a plain note); this is the curated set
 * that team members want to be told about.
 */
const NOTIFY_TYPES = new Set<string>([
  "invoice.paid",
  "invoice.overdue",
  "proposal.accepted",
  "proposal.declined",
  "ticket.created",
  "ticket.resolved",
  "website.published",
  "domain.verified",
  "team.invited",
  "form.submitted",
  "review.created",
  "workflow.failed",
]);

/**
 * Maps an event type to the dashboard destination for its notification.
 * Unknown types fall back to the app home.
 */
function linkFor(type: string): string {
  const section = type.split(".")[0];
  const known: Record<string, string> =
    {
      invoice: "/app#invoices",
      proposal: "/app#proposals",
      ticket: "/app#support",
      website: "/app#ai-website-builder",
      domain: "/app#domains",
      team: "/app#team",
      form: "/app#forms",
      review: "/app#reviews",
    };

  return known[section] ?? "/app";
}

export interface NotificationHandlerDeps {
  notifications: NotificationService;

  /**
   * Resolves the team-member user ids that should receive notifications for
   * the acting tenant. Runs inside the event's tenant scope. Typically the
   * org's active owners/admins.
   */
  resolveRecipients: (
    event: ActivityEventRecord,
  ) => Promise<string[]>;
}

/**
 * Builds an {@link ActivityHandler} that fans notification-worthy activity
 * events out to the tenant's recipients. Best-effort: any failure is
 * swallowed by the ActivityService so it can't break the source action.
 */
export function createNotificationActivityHandler(
  deps: NotificationHandlerDeps,
): ActivityHandler {
  return async (event) => {
    if (!NOTIFY_TYPES.has(event.type)) {
      return;
    }

    const recipients =
      await deps.resolveRecipients(
        event,
      );

    const link = linkFor(event.type);

    await Promise.all(
      recipients.map((userId) =>
        deps.notifications.create({
          userId,
          type: event.type,
          title: event.title,
          body: event.summary,
          link,
        }),
      ),
    );
  };
}
