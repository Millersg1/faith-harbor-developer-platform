import {
  describe,
  expect,
  it,
} from "vitest";

import { ClientService } from "../clients/ClientService";

import { CampaignRepository } from "./CampaignRepository";
import { CampaignService } from "./CampaignService";

function createCampaignService() {
  const clients =
    new ClientService();

  const repository =
    new CampaignRepository();

  const service =
    new CampaignService(
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

describe("CampaignService", () => {
  it("creates and saves a campaign", () => {
    const {
      service,
    } = createCampaignService();

    const campaign =
      service.create({
        name: "  Spring Launch  ",
        channel: "Instagram",
        budget: 1000,
        audience: "Local churches",
      });

    expect(campaign.id)
      .toBeDefined();

    expect(campaign.name)
      .toBe("Spring Launch");

    expect(campaign.channel)
      .toBe("Instagram");

    expect(campaign.status)
      .toBe("planned");

    expect(campaign.budget)
      .toBe(1000);

    expect(service.list())
      .toEqual([campaign]);
  });

  it("links a campaign to a client", () => {
    const {
      service,
      clients,
    } = createCampaignService();

    const client =
      createClient(clients);

    const campaign =
      service.create({
        clientId: client.id,
        name: "Client Campaign",
      });

    expect(campaign.clientId)
      .toBe(client.id);
  });

  it("defaults status to planned", () => {
    const {
      service,
    } = createCampaignService();

    const campaign =
      service.create({
        name: "Planned Campaign",
      });

    expect(campaign.status)
      .toBe("planned");
  });

  it("lists campaigns for one client", () => {
    const {
      service,
      clients,
    } = createCampaignService();

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

    const firstCampaign =
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

    const thirdCampaign =
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
      firstCampaign,
      thirdCampaign,
    ]);
  });

  it("activates a campaign on update", () => {
    const {
      service,
    } = createCampaignService();

    const campaign =
      service.create({
        name: "Launch",
        status: "planned",
      });

    const updated =
      service.update({
        ...campaign,

        status: "active",

        spend: 400,
      });

    expect(updated.status)
      .toBe("active");

    expect(
      service.get(campaign.id)
        .spend,
    ).toBe(400);
  });

  it("deletes a campaign", () => {
    const {
      service,
    } = createCampaignService();

    const campaign =
      service.create({
        name: "To Delete",
      });

    expect(service.list())
      .toHaveLength(1);

    service.delete(campaign.id);

    expect(service.list())
      .toHaveLength(0);
  });

  it("rejects a campaign with no name", () => {
    const {
      service,
    } = createCampaignService();

    expect(() =>
      service.create({
        name: "   ",
      }),
    ).toThrow(
      "A campaign requires a name.",
    );
  });

  it("rejects a campaign for a missing client", () => {
    const {
      service,
    } = createCampaignService();

    expect(() =>
      service.create({
        clientId:
          "missing-client",
        name: "Bad Campaign",
      }),
    ).toThrow(
      'Client "missing-client" was not found.',
    );

    expect(service.list())
      .toHaveLength(0);
  });
});
