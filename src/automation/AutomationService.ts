import { randomUUID } from "node:crypto";

import type { ClientRecord } from "../clients/ClientTypes";
import type { EmailService } from "../communications/EmailService";
import type { ProjectRecord } from "../projects/ProjectRecord";
import type { LeadRecord } from "../sales/LeadRecord";

import { AutomationRepository } from "./AutomationRepository";
import {
  buildLeadWelcomeDraft,
  buildProjectOnboardingDraft,
} from "./AutomationRules";
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
  constructor(
    private readonly emails: EmailService,
    private readonly repository =
      new AutomationRepository(),
  ) {}

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

    return this.repository.create(
      draft,
    );
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
