import { randomUUID } from "node:crypto";

import { AIService } from "../ai/AIService";
import type { RuntimeMessage } from "../ai/runtime/RuntimeMessage";
import { ClientService } from "../clients/ClientService";
import type { ProposalRecord } from "./ProposalRecord";
import { ProposalRepository } from "./ProposalRepository";
import type { ProposalRequest } from "./ProposalRequest";

/**
 * Generates and manages client proposal drafts.
 */
export class ProposalService {
  constructor(
    private readonly ai: AIService,
    private readonly clients:
      ClientService,
    private readonly repository =
      new ProposalRepository(),
  ) {}

  /**
   * Generates and saves a proposal draft.
   */
  async generate(
    request: ProposalRequest,
  ): Promise<ProposalRecord> {
    const client =
      this.findOrCreateClient(
        request.clientName,
      );

    const session =
      this.ai.createWorkerSession(
        "proposal-writer",
        {
          metadata: {
            clientId: client.id,

            clientName:
              client.companyName,
          },
        },
      );

    await this.ai.sendRuntimeMessage(
      session.id,
      this.buildPrompt(request),
    );

    const messages =
      this.ai.getRuntimeMessages(
        session.id,
      );

    const now =
      new Date().toISOString();

    const proposal:
      ProposalRecord = {
        id: randomUUID(),

        clientId:
          client.id,

        clientName:
          client.companyName,

        service:
          this.getServiceName(
            request,
          ),

        requestedOutcome:
          request.requestedOutcome,

        proposal:
          this.findLatestAssistantMessage(
            messages,
          ),

        status: "draft",

        createdAt: now,

        updatedAt: now,

        metadata: {
          ...request.metadata,

          runtimeSessionId:
            session.id,
        },
      };

    return this.repository.create(
      proposal,
    );
  }

  /**
   * Returns every saved proposal.
   */
  list():
  readonly ProposalRecord[] {
    return this.repository.list();
  }

  /**
   * Returns one saved proposal.
   */
  get(
    proposalId: string,
  ): ProposalRecord {
    return this.repository.get(
      proposalId,
    );
  }

  /**
   * Returns proposals belonging to one client.
   */
  listForClient(
    clientId: string,
  ): readonly ProposalRecord[] {
    return this.repository
      .list()
      .filter(
        (proposal) =>
          proposal.clientId ===
          clientId,
      );
  }

  /**
   * Permanently deletes one proposal.
   */
  delete(
    proposalId: string,
  ): void {
    this.repository.delete(
      proposalId,
    );
  }

  /**
   * Finds an existing client by company name or creates one.
   */
  private findOrCreateClient(
    companyName: string,
  ) {
    const normalizedName =
      companyName
        .trim()
        .toLowerCase();

    const existing =
      this.clients
        .list()
        .find(
          (client) =>
            client.companyName
              .trim()
              .toLowerCase() ===
            normalizedName,
        );

    if (existing) {
      return existing;
    }

    return this.clients.create({
      companyName:
        companyName.trim(),

      primaryContact:
        "To be confirmed",

      notes:
        "Client record created automatically from proposal generation.",
    });
  }

  /**
   * Builds the proposal prompt.
   */
  private buildPrompt(
    request: ProposalRequest,
  ): string {
    const service =
      this.getServiceName(
        request,
      );

    const additionalNotes =
      typeof request.metadata
        ?.additionalNotes === "string"
        ? request.metadata
            .additionalNotes
        : "";

    return `
Prepare a professional client proposal.

Service:
${service}

Client:
${request.clientName}

Requested Outcome:
${request.requestedOutcome}

Requirements:
${request.requirements}

${request.dueDate ? `Requested Delivery: ${request.dueDate}` : ""}

${additionalNotes ? `Additional Notes:\n${additionalNotes}` : ""}

The proposal should include:

1. Executive Summary
2. Understanding of Client Needs
3. Recommended Solution
4. Scope of Work
5. Expected Benefits
6. Pricing and Timeline
7. Next Steps
8. Assumptions and Items to Confirm
9. Exclusions
10. Final Human Review Notice

Write in a professional consulting style.
Do not invent pricing, deadlines, guarantees,
service levels, credentials, or commitments.
`.trim();
  }

  /**
   * Returns the selected service name.
   */
  private getServiceName(
    request: ProposalRequest,
  ): string {
    const service =
      request.metadata?.service;

    if (
      typeof service === "string" &&
      service.trim().length > 0
    ) {
      return service.trim();
    }

    return request.requestedOutcome;
  }

  /**
   * Returns the latest assistant response.
   */
  private findLatestAssistantMessage(
    messages:
      readonly RuntimeMessage[],
  ): string {
    const assistantMessages =
      messages.filter(
        (message) =>
          message.role ===
          "assistant",
      );

    const latest =
      assistantMessages.at(-1);

    if (!latest) {
      throw new Error(
        "The proposal worker did not return a response.",
      );
    }

    return latest.content;
  }
}