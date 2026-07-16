import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ProviderHealth,
  ProviderMetadata,
} from "../ai/AIProvider";
import { AIService } from "../ai/AIService";
import type { AICapability } from "../ai/Capability";
import { ProviderManager } from "../ai/ProviderManager";
import { ProviderRegistry } from "../ai/ProviderRegistry";
import { RuntimeSessionManager } from "../ai/runtime/RuntimeSessionManager";
import { AIWorkerRegistry } from "../ai/workers/AIWorkerRegistry";
import { ProposalWriter } from "../ai/workers/builtins/ProposalWriter";
import { ClientService } from "../clients/ClientService";
import { ProposalService } from "./ProposalService";

class TestProvider implements AIProvider {
  readonly id = "test-provider";
  readonly name = "Test Provider";

  readonly capabilities:
    readonly AICapability[] = [
      "writing",
      "research",
    ];

  readonly metadata: ProviderMetadata = {
    vendor: "Faith Harbor",
    version: "1.0.0",
    models: ["test-model"],
    supportsStreaming: false,
    supportsVision: false,
    supportsTools: false,
  };

  async generate(
    request: AIRequest,
  ): Promise<AIResponse> {
    return {
      provider: this.id,
      capability:
        request.capability,
      content:
        "# Generated Proposal\n\nProposal content.",
      model: "test-model",
    };
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: "healthy",
      checkedAt:
        new Date().toISOString(),
    };
  }
}

function createProposalService() {
  const providerRegistry =
    new ProviderRegistry();

  providerRegistry.register(
    new TestProvider(),
  );

  const providerManager =
    new ProviderManager(
      providerRegistry,
    );

  const runtime =
    new RuntimeSessionManager();

  const workers =
    new AIWorkerRegistry();

  workers.register(
    ProposalWriter,
  );

  const aiService =
    new AIService(
      providerRegistry,
      providerManager,
      runtime,
      workers,
    );

  const clientService =
    new ClientService();

  return {
    service:
      new ProposalService(
        aiService,
        clientService,
      ),

    clients:
      clientService,
  };
}

describe("ProposalService", () => {
  it("generates and saves a proposal", async () => {
    const {
      service,
      clients,
    } = createProposalService();

    const proposal =
      await service.generate({
        clientName:
          "Acme Manufacturing",

        requestedOutcome:
          "Managed IT Services Proposal",

        requirements:
          "Provide managed IT support.",

        metadata: {
          service:
            "Managed IT Services",
        },
      });

    expect(proposal.id).toBeDefined();

    expect(proposal.clientId)
      .toBeDefined();

    expect(proposal.clientName)
      .toBe(
        "Acme Manufacturing",
      );

    expect(proposal.service)
      .toBe(
        "Managed IT Services",
      );

    expect(proposal.status)
      .toBe("draft");

    expect(proposal.proposal)
      .toContain(
        "Generated Proposal",
      );

    expect(service.list())
      .toEqual([proposal]);

    expect(
      service.get(proposal.id),
    ).toBe(proposal);

    expect(clients.list())
      .toHaveLength(1);
  });

  it("reuses an existing client with the same company name", async () => {
    const {
      service,
      clients,
    } = createProposalService();

    const existingClient =
      clients.create({
        companyName:
          "Acme Manufacturing",

        primaryContact:
          "Jordan Smith",
      });

    const proposal =
      await service.generate({
        clientName:
          "  ACME MANUFACTURING  ",

        requestedOutcome:
          "Website Proposal",

        requirements:
          "Create a new website.",
      });

    expect(proposal.clientId)
      .toBe(existingClient.id);

    expect(clients.list())
      .toHaveLength(1);
  });

  it("lists proposals for one client", async () => {
    const {
      service,
    } = createProposalService();

    const first =
      await service.generate({
        clientName:
          "Acme Manufacturing",

        requestedOutcome:
          "Managed IT Proposal",

        requirements:
          "Managed IT support.",
      });

    await service.generate({
      clientName:
        "Another Company",

      requestedOutcome:
        "Website Proposal",

      requirements:
        "Website development.",
    });

    expect(
      service.listForClient(
        first.clientId,
      ),
    ).toEqual([first]);
  });
});