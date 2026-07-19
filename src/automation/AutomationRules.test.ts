import {
  describe,
  expect,
  it,
} from "vitest";

import type { LeadRecord } from "../sales/LeadRecord";

import { buildLeadWelcomeDraft } from "./AutomationRules";

function makeLead(
  overrides: Partial<LeadRecord> = {},
): LeadRecord {
  return {
    id: "lead-1",
    name: "Jane Doe",
    email: "jane@example.com",
    company: "Acme Co.",
    status: "new",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildLeadWelcomeDraft", () => {
  it("drafts a welcome email addressed to the lead", () => {
    const draft =
      buildLeadWelcomeDraft(
        makeLead(),
      );

    expect(draft).not.toBeNull();
    expect(draft?.to)
      .toBe("jane@example.com");
    expect(draft?.subject)
      .toContain("Faith Harbor");
    expect(draft?.body)
      .toContain("Jane Doe");
    expect(draft?.title)
      .toContain("Acme Co.");
  });

  it("mentions the service interest when present", () => {
    const draft =
      buildLeadWelcomeDraft(
        makeLead({
          serviceInterest:
            "a church website",
        }),
      );

    expect(draft?.body)
      .toContain("a church website");
  });

  it("carries the client id through when the lead is linked", () => {
    const draft =
      buildLeadWelcomeDraft(
        makeLead({
          clientId: "client-9",
        }),
      );

    expect(draft?.clientId)
      .toBe("client-9");
  });

  it("returns null when the lead has no email", () => {
    expect(
      buildLeadWelcomeDraft(
        makeLead({ email: undefined }),
      ),
    ).toBeNull();

    expect(
      buildLeadWelcomeDraft(
        makeLead({ email: "   " }),
      ),
    ).toBeNull();
  });

  it("falls back to the contact name when there is no company", () => {
    const draft =
      buildLeadWelcomeDraft(
        makeLead({
          company: undefined,
        }),
      );

    expect(draft?.title)
      .toContain("Jane Doe");
  });
});
