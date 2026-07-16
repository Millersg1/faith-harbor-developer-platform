import {
  describe,
  expect,
  it,
} from "vitest";

import { ProposalRepository } from "./ProposalRepository";

describe(
  "ProposalRepository",
  () => {
    it(
      "stores and retrieves proposals",
      () => {
        const repository =
          new ProposalRepository();

        repository.create({
          id: "proposal-1",
          clientName: "Acme",
          service: "Managed IT",
          requestedOutcome:
            "Managed IT Proposal",
          proposal: "Proposal text",
          status: "draft",
          createdAt:
            new Date().toISOString(),
          updatedAt:
            new Date().toISOString(),
        });

        expect(
          repository.list(),
        ).toHaveLength(1);

        expect(
          repository.get("proposal-1")
            .clientName,
        ).toBe("Acme");
      },
    );
  },
);