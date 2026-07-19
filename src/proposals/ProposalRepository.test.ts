import {
  describe,
  expect,
  it,
} from "vitest";

import { ProposalRepository } from "./ProposalRepository";

describe("ProposalRepository", () => {
  it("stores and retrieves proposals", () => {
    const repository =
      new ProposalRepository();

    const now =
      new Date().toISOString();

    repository.create({
      id: "proposal-1",
      clientId: "client-1",
      clientName: "Acme",
      service: "Managed IT",
      requestedOutcome:
        "Managed IT Proposal",
      proposal: "Proposal text",
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

    expect(
      repository.list(),
    ).toHaveLength(1);

    const proposal =
      repository.get("proposal-1");

    expect(proposal.clientId).toBe(
      "client-1",
    );

    expect(proposal.clientName).toBe(
      "Acme",
    );
  });
});