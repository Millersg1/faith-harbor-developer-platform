import {
  describe,
  expect,
  it,
} from "vitest";

import { ClientWorkRequestFactory } from "./ClientWorkRequestFactory";

describe(
  "ClientWorkRequestFactory",
  () => {
    it(
      "creates a workflow definition from a client request",
      () => {
        const factory =
          new ClientWorkRequestFactory();

        const workflow =
          factory.create({
            id: "request-001",
            clientName:
              "Faith Harbor LLC",
            requestedOutcome:
              "Prepare client proposal",
            department:
              "Client Services",
            owner: "Shawn",
            requiresApproval: true,
            dueDate:
              "2026-07-20",
            metadata: {
              priority: "high",
            },
          });

        expect(workflow.id).toBe(
          "request-001",
        );

        expect(workflow.name).toBe(
          "Prepare client proposal",
        );

        expect(
          workflow.department,
        ).toBe(
          "Client Services",
        );

        expect(
          workflow.requiresApproval,
        ).toBe(true);

        expect(
          workflow.metadata
            ?.clientName,
        ).toBe(
          "Faith Harbor LLC",
        );

        expect(
          workflow.metadata
            ?.priority,
        ).toBe("high");
      },
    );
  },
);