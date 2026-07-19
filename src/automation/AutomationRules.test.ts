import {
  describe,
  expect,
  it,
} from "vitest";

import type { ClientRecord } from "../clients/ClientTypes";
import type { ProjectRecord } from "../projects/ProjectRecord";
import type { LeadRecord } from "../sales/LeadRecord";

import {
  buildLeadWelcomeDraft,
  buildProjectOnboardingDraft,
} from "./AutomationRules";

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

function makeProject(
  overrides: Partial<ProjectRecord> = {},
): ProjectRecord {
  return {
    id: "project-1",
    clientId: "client-1",
    name: "Church Website Rebuild",
    status: "planned",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeClient(
  overrides: Partial<ClientRecord> = {},
): ClientRecord {
  return {
    id: "client-1",
    companyName: "Grace Chapel",
    primaryContact: "Pastor John",
    email: "john@gracechapel.example",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildProjectOnboardingDraft", () => {
  it("drafts an onboarding email to the client", () => {
    const draft =
      buildProjectOnboardingDraft(
        makeProject(),
        makeClient(),
      );

    expect(draft).not.toBeNull();
    expect(draft?.to)
      .toBe("john@gracechapel.example");
    expect(draft?.subject)
      .toContain(
        "Church Website Rebuild",
      );
    expect(draft?.body)
      .toContain("Pastor John");
    expect(draft?.clientId)
      .toBe("client-1");
  });

  it("returns null when the client has no email", () => {
    expect(
      buildProjectOnboardingDraft(
        makeProject(),
        makeClient({
          email: undefined,
        }),
      ),
    ).toBeNull();
  });

  it("greets by company when there is no contact name", () => {
    const draft =
      buildProjectOnboardingDraft(
        makeProject(),
        makeClient({
          primaryContact: "   ",
        }),
      );

    expect(draft?.body)
      .toContain("Grace Chapel");
  });
});
