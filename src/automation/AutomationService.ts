import { randomUUID } from "node:crypto";

import type { InvoiceRecord } from "../accounting/InvoiceRecord";
import type { ClientRecord } from "../clients/ClientTypes";
import type { EmailService } from "../communications/EmailService";
import type { ProjectRecord } from "../projects/ProjectRecord";
import type { LeadRecord } from "../sales/LeadRecord";

import { AutomationRepository } from "./AutomationRepository";
import {
  buildInvoiceReminderDraft,
  buildLeadFollowUpDraft,
  buildLeadWelcomeDraft,
  buildProjectCheckInDraft,
  buildProjectOnboardingDraft,
  buildReviewRequestDraft,
  type ReviewRequestContent,
} from "./AutomationRules";
import type { DraftPersonalizer } from "./DraftPersonalizer";
import type {
  AutomationDraft,
  AutomationTrigger,
} from "./AutomationTypes";

/**
 * Prepares proposed actions in response to business events and holds
 * them until a human approves.
 *
 * This is the automation engine. It deliberately never sends anything
 * on its own: an event produces a *pending* draft, and only an
 * explicit human approval hands that draft to the email service. That
 * keeps a person in control of everything that leaves Faith Harbor.
 */
export class AutomationService {
  /**
   * In-flight AI personalization promises, tracked so tests can wait
   * for enhancement to settle. Enhancement is otherwise fire-and-
   * forget: the draft exists immediately with its template body.
   */
  private readonly enhancements =
    new Set<Promise<void>>();

  constructor(
    private readonly emails: EmailService,
    private readonly repository =
      new AutomationRepository(),
    private readonly personalizer?: DraftPersonalizer,
  ) {}

  /**
   * Waits for any in-flight AI personalization to finish. Intended
   * for tests; production never needs to block on it.
   */
  async settle(): Promise<void> {
    await Promise.allSettled(
      this.enhancements,
    );
  }

  /**
   * Reacts to a newly created lead by drafting a welcome email.
   *
   * Called by the sales module after a lead is stored. Failures here
   * must never break lead creation, so the caller wraps this in a
   * best-effort guard; the draft is a convenience, not a requirement.
   */
  onLeadCreated(
    lead: LeadRecord,
  ): AutomationDraft | null {
    const content =
      buildLeadWelcomeDraft(lead);

    if (!content) {
      return null;
    }

    return this.record(
      "lead.created",
      "lead",
      lead.id,
      content.title,
      content.to,
      content.subject,
      content.body,
      content.clientId,
    );
  }

  /**
   * Reacts to a newly created project by drafting an onboarding email
   * to the client.
   *
   * Called by the projects module after a project is stored, whether
   * it was created directly or from an accepted proposal. The client
   * is passed in so this stays independent of client lookups.
   */
  onProjectCreated(
    project: ProjectRecord,
    client: ClientRecord,
  ): AutomationDraft | null {
    const content =
      buildProjectOnboardingDraft(
        project,
        client,
      );

    if (!content) {
      return null;
    }

    return this.record(
      "project.created",
      "project",
      project.id,
      content.title,
      content.to,
      content.subject,
      content.body,
      content.clientId,
    );
  }

  /**
   * Reacts to an overdue invoice by drafting a payment reminder.
   *
   * Called by the scanner for each invoice it judges overdue. To
   * avoid nagging, at most one reminder draft is ever prepared per
   * invoice: if one already exists (pending, approved, or dismissed)
   * this does nothing and returns null.
   */
  onInvoiceOverdue(
    invoice: InvoiceRecord,
    client: ClientRecord,
  ): AutomationDraft | null {
    if (
      this.hasDraftFor(
        "invoice.overdue",
        invoice.id,
      )
    ) {
      return null;
    }

    const content =
      buildInvoiceReminderDraft(
        invoice,
        client,
      );

    if (!content) {
      return null;
    }

    return this.record(
      "invoice.overdue",
      "invoice",
      invoice.id,
      content.title,
      content.to,
      content.subject,
      content.body,
      content.clientId,
    );
  }

  /**
   * Reacts to a lead that has gone quiet by drafting a follow-up.
   *
   * Called by the scanner. At most one follow-up draft is prepared
   * per lead; if one already exists this returns null.
   */
  onLeadQuiet(
    lead: LeadRecord,
  ): AutomationDraft | null {
    if (
      this.hasDraftFor(
        "lead.quiet",
        lead.id,
      )
    ) {
      return null;
    }

    const content =
      buildLeadFollowUpDraft(lead);

    if (!content) {
      return null;
    }

    return this.record(
      "lead.quiet",
      "lead",
      lead.id,
      content.title,
      content.to,
      content.subject,
      content.body,
      content.clientId,
    );
  }

  /**
   * Reacts to a project that has stalled by drafting a check-in.
   *
   * Called by the scanner. At most one check-in draft is prepared per
   * project; if one already exists this returns null.
   */
  onProjectStalled(
    project: ProjectRecord,
    client: ClientRecord,
  ): AutomationDraft | null {
    if (
      this.hasDraftFor(
        "project.stalled",
        project.id,
      )
    ) {
      return null;
    }

    const content =
      buildProjectCheckInDraft(
        project,
        client,
      );

    if (!content) {
      return null;
    }

    return this.record(
      "project.stalled",
      "project",
      project.id,
      content.title,
      content.to,
      content.subject,
      content.body,
      content.clientId,
    );
  }

  /**
   * Prepares a Google review-request email to a customer.
   *
   * Called by the reviews module. At most one review request is
   * prepared per customer per business (dedup on the customer email),
   * so the same person is never asked twice by the automation.
   */
  onReviewRequested(
    input: ReviewRequestContent,
  ): AutomationDraft | null {
    const relatedId = `${input.clientId ?? "client"}:${input.customerEmail
      .trim()
      .toLowerCase()}`;

    if (
      this.hasDraftFor(
        "review.requested",
        relatedId,
      )
    ) {
      return null;
    }

    const content =
      buildReviewRequestDraft(input);

    if (!content) {
      return null;
    }

    return this.record(
      "review.requested",
      "review",
      relatedId,
      content.title,
      content.to,
      content.subject,
      content.body,
      content.clientId,
    );
  }

  /**
   * Returns true when a draft already exists for a given trigger and
   * related record, so time-based scans never create duplicates.
   */
  hasDraftFor(
    trigger: AutomationTrigger,
    relatedId: string,
  ): boolean {
    return this.repository
      .list()
      .some(
        (draft) =>
          draft.trigger ===
            trigger &&
          draft.relatedId ===
            relatedId,
      );
  }

  /**
   * Stores a new pending draft.
   */
  private record(
    trigger: AutomationTrigger,
    relatedType: string,
    relatedId: string,
    title: string,
    to: string,
    subject: string,
    body: string,
    clientId?: string,
  ): AutomationDraft {
    const draft: AutomationDraft = {
      id: randomUUID(),
      trigger,
      title,
      to,
      subject,
      body,
      status: "pending",
      relatedType,
      relatedId,
      clientId,
      createdAt:
        new Date().toISOString(),
    };

    const created =
      this.repository.create(draft);

    // The draft exists immediately with its reliable template body.
    // If AI is configured, personalize it in the background before a
    // human reviews it; any failure simply keeps the template.
    if (this.personalizer) {
      const promise = this.enhance(
        created,
      ).finally(() => {
        this.enhancements.delete(
          promise,
        );
      });

      this.enhancements.add(promise);
    }

    return created;
  }

  /**
   * Replaces a draft's body with an AI-personalized version, if the
   * personalizer returns one. Best-effort: errors are swallowed and
   * the template body is left in place.
   */
  private async enhance(
    draft: AutomationDraft,
  ): Promise<void> {
    try {
      const body =
        await this.personalizer?.personalize(
          {
            to: draft.to,
            subject: draft.subject,
            body: draft.body,
            trigger: draft.trigger,
          },
        );

      if (body && body !== draft.body) {
        this.repository.updateBody(
          draft.id,
          body,
        );
      }
    } catch {
      // Keep the template body.
    }
  }

  /**
   * Returns every draft, newest first.
   */
  list(): readonly AutomationDraft[] {
    return this.repository.list();
  }

  /**
   * Returns only the drafts awaiting a decision.
   */
  listPending():
    readonly AutomationDraft[] {
    return this.repository
      .list()
      .filter(
        (draft) =>
          draft.status === "pending",
      );
  }

  /**
   * Approves a pending draft and carries out its action.
   *
   * For an email draft this sends (or logs) the message through the
   * email service and records the resulting outbox id on the draft.
   */
  async approve(
    id: string,
  ): Promise<AutomationDraft> {
    const draft =
      this.repository.get(id);

    if (draft.status !== "pending") {
      throw new Error(
        "Only a pending draft can be approved.",
      );
    }

    const email =
      await this.emails.send({
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
        clientId: draft.clientId,
      });

    return this.repository.update({
      ...draft,
      status: "approved",
      emailId: email.id,
      resolvedAt:
        new Date().toISOString(),
    });
  }

  /**
   * Dismisses a pending draft without acting on it.
   */
  dismiss(
    id: string,
  ): AutomationDraft {
    const draft =
      this.repository.get(id);

    if (draft.status !== "pending") {
      throw new Error(
        "Only a pending draft can be dismissed.",
      );
    }

    return this.repository.update({
      ...draft,
      status: "dismissed",
      resolvedAt:
        new Date().toISOString(),
    });
  }
}
