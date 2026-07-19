import {
  describe,
  expect,
  it,
} from "vitest";

import { LeadRepository } from "./LeadRepository";
import type { LeadStatus } from "./LeadStatus";

function createLead(
  repository: LeadRepository,
  overrides: Partial<{
    id: string;
    clientId: string;
    name: string;
    status: LeadStatus;
  }> = {},
) {
  const now =
    new Date().toISOString();

  return repository.create({
    id:
      overrides.id ??
      "lead-1",

    clientId:
      overrides.clientId,

    name:
      overrides.name ??
      "Acme Prospect",

    company: "Acme Co",

    email: "buyer@acme.example",

    source: "Referral",

    serviceInterest:
      "Website Development",

    estimatedValue: 5000,

    status:
      overrides.status ??
      "new",

    owner: "Shawn",

    metadata: {
      priority: "high",
    },

    createdAt: now,
    updatedAt: now,
  });
}

describe("LeadRepository", () => {
  it("stores and retrieves leads", () => {
    const repository =
      new LeadRepository();

    createLead(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    const lead =
      repository.get("lead-1");

    expect(lead.name).toBe(
      "Acme Prospect",
    );

    expect(lead.company).toBe(
      "Acme Co",
    );

    expect(lead.status).toBe("new");

    expect(lead.estimatedValue).toBe(
      5000,
    );
  });

  it("stores a lead without a client", () => {
    const repository =
      new LeadRepository();

    createLead(repository);

    const lead =
      repository.get("lead-1");

    expect(
      lead.clientId,
    ).toBeUndefined();
  });

  it("lists leads for one client", () => {
    const repository =
      new LeadRepository();

    createLead(repository, {
      id: "lead-1",
      clientId: "client-1",
    });

    createLead(repository, {
      id: "lead-2",
      clientId: "client-2",
    });

    createLead(repository, {
      id: "lead-3",
      clientId: "client-1",
    });

    const leads =
      repository.findByClientId(
        "client-1",
      );

    expect(leads).toHaveLength(2);

    expect(
      leads.every(
        (lead) =>
          lead.clientId ===
          "client-1",
      ),
    ).toBe(true);
  });

  it("updates a lead", () => {
    const repository =
      new LeadRepository();

    createLead(repository);

    const existing =
      repository.get("lead-1");

    const updated =
      repository.update({
        ...existing,

        status: "won",

        notes: "Signed the deal.",

        updatedAt:
          new Date().toISOString(),
      });

    expect(updated.status).toBe(
      "won",
    );

    const stored =
      repository.get("lead-1");

    expect(stored.status).toBe(
      "won",
    );

    expect(stored.notes).toBe(
      "Signed the deal.",
    );
  });

  it("stores lead metadata", () => {
    const repository =
      new LeadRepository();

    createLead(repository);

    const lead =
      repository.get("lead-1");

    expect(lead.metadata).toEqual({
      priority: "high",
    });
  });

  it("deletes a lead", () => {
    const repository =
      new LeadRepository();

    createLead(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    repository.delete("lead-1");

    expect(
      repository.list(),
    ).toHaveLength(0);
  });

  it("throws when a lead is missing", () => {
    const repository =
      new LeadRepository();

    expect(() =>
      repository.get("missing"),
    ).toThrow(
      'Lead "missing" was not found.',
    );
  });
});
