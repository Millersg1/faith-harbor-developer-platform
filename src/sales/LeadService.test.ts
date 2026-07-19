import {
  describe,
  expect,
  it,
} from "vitest";

import { ClientService } from "../clients/ClientService";

import { LeadRepository } from "./LeadRepository";
import { LeadService } from "./LeadService";

function createLeadService() {
  const clients =
    new ClientService();

  const repository =
    new LeadRepository();

  const service =
    new LeadService(
      clients,
      repository,
    );

  return {
    service,
    clients,
    repository,
  };
}

function createClient(
  clients: ClientService,
  companyName =
    "Acme Manufacturing",
) {
  return clients.create({
    companyName,

    primaryContact:
      "Jordan Smith",
  });
}

describe("LeadService", () => {
  it("creates and saves a lead", () => {
    const {
      service,
    } = createLeadService();

    const lead =
      service.create({
        name: "  Acme Prospect  ",
        company: "Acme Co",
        source: "Referral",
        estimatedValue: 5000,
        serviceInterest:
          "Website Development",
      });

    expect(lead.id)
      .toBeDefined();

    expect(lead.name)
      .toBe("Acme Prospect");

    expect(lead.status)
      .toBe("new");

    expect(lead.estimatedValue)
      .toBe(5000);

    expect(service.list())
      .toEqual([lead]);
  });

  it("links a lead to an existing client", () => {
    const {
      service,
      clients,
    } = createLeadService();

    const client =
      createClient(clients);

    const lead =
      service.create({
        clientId: client.id,
        name: "Repeat Buyer",
      });

    expect(lead.clientId)
      .toBe(client.id);
  });

  it("defaults status to new", () => {
    const {
      service,
    } = createLeadService();

    const lead =
      service.create({
        name: "Fresh Lead",
      });

    expect(lead.status)
      .toBe("new");
  });

  it("lists leads for one client", () => {
    const {
      service,
      clients,
    } = createLeadService();

    const firstClient =
      createClient(
        clients,
        "First Client",
      );

    const secondClient =
      createClient(
        clients,
        "Second Client",
      );

    const firstLead =
      service.create({
        clientId:
          firstClient.id,
        name: "A",
      });

    service.create({
      clientId:
        secondClient.id,
      name: "B",
    });

    const thirdLead =
      service.create({
        clientId:
          firstClient.id,
        name: "C",
      });

    expect(
      service.listForClient(
        firstClient.id,
      ),
    ).toEqual([
      firstLead,
      thirdLead,
    ]);
  });

  it("moves a lead through the pipeline on update", () => {
    const {
      service,
    } = createLeadService();

    const lead =
      service.create({
        name: "Pipeline Lead",
        status: "new",
      });

    const updated =
      service.update({
        ...lead,

        status: "won",
      });

    expect(updated.status)
      .toBe("won");

    expect(
      service.get(lead.id)
        .status,
    ).toBe("won");
  });

  it("deletes a lead", () => {
    const {
      service,
    } = createLeadService();

    const lead =
      service.create({
        name: "To Delete",
      });

    expect(service.list())
      .toHaveLength(1);

    service.delete(lead.id);

    expect(service.list())
      .toHaveLength(0);
  });

  it("rejects a lead with no name", () => {
    const {
      service,
    } = createLeadService();

    expect(() =>
      service.create({
        name: "   ",
      }),
    ).toThrow(
      "A lead requires a name.",
    );
  });

  it("rejects a lead for a missing client", () => {
    const {
      service,
    } = createLeadService();

    expect(() =>
      service.create({
        clientId:
          "missing-client",
        name: "Bad Lead",
      }),
    ).toThrow(
      'Client "missing-client" was not found.',
    );

    expect(service.list())
      .toHaveLength(0);
  });

  it("converts a won lead into a client", () => {
    const {
      service,
      clients,
    } = createLeadService();

    const lead =
      service.create({
        name: "Jordan Smith",
        company: "Acme Co",
        email: "jordan@acme.example",
        phone: "555-0100",
        source: "Referral",
        serviceInterest:
          "Website Development",
        estimatedValue: 5000,
      });

    const result =
      service.convertToClient(
        lead.id,
      );

    // A client is created from the lead.
    expect(result.client.companyName)
      .toBe("Acme Co");

    expect(
      result.client.primaryContact,
    ).toBe("Jordan Smith");

    expect(result.client.email)
      .toBe("jordan@acme.example");

    expect(
      result.client.metadata
        ?.convertedFromLeadId,
    ).toBe(lead.id);

    // The lead is linked and marked won.
    expect(result.lead.clientId)
      .toBe(result.client.id);

    expect(result.lead.status)
      .toBe("won");

    // The client is persisted.
    expect(
      clients.get(
        result.client.id,
      ).companyName,
    ).toBe("Acme Co");
  });

  it("uses the lead name when no company is set", () => {
    const {
      service,
    } = createLeadService();

    const lead =
      service.create({
        name: "Solo Founder",
      });

    const result =
      service.convertToClient(
        lead.id,
      );

    expect(result.client.companyName)
      .toBe("Solo Founder");
  });

  it("rejects converting an already-linked lead", () => {
    const {
      service,
    } = createLeadService();

    const lead =
      service.create({
        name: "Repeat Buyer",
      });

    service.convertToClient(lead.id);

    expect(() =>
      service.convertToClient(
        lead.id,
      ),
    ).toThrow(
      "Lead is already linked to a client.",
    );
  });

  it("throws when converting a missing lead", () => {
    const {
      service,
    } = createLeadService();

    expect(() =>
      service.convertToClient(
        "missing",
      ),
    ).toThrow(
      'Lead "missing" was not found.',
    );
  });
});
