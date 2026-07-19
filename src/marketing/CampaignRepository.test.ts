import {
  describe,
  expect,
  it,
} from "vitest";

import { CampaignRepository } from "./CampaignRepository";
import type { CampaignStatus } from "./CampaignStatus";

function createCampaign(
  repository: CampaignRepository,
  overrides: Partial<{
    id: string;
    clientId: string;
    name: string;
    status: CampaignStatus;
  }> = {},
) {
  const now =
    new Date().toISOString();

  return repository.create({
    id:
      overrides.id ??
      "campaign-1",

    clientId:
      overrides.clientId,

    name:
      overrides.name ??
      "Spring Launch",

    channel: "Facebook",

    status:
      overrides.status ??
      "planned",

    audience: "Local churches",

    budget: 1000,

    spend: 250,

    leads: 12,

    metadata: {
      utm: "spring",
    },

    createdAt: now,
    updatedAt: now,
  });
}

describe("CampaignRepository", () => {
  it("stores and retrieves campaigns", () => {
    const repository =
      new CampaignRepository();

    createCampaign(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    const campaign =
      repository.get("campaign-1");

    expect(campaign.name).toBe(
      "Spring Launch",
    );

    expect(campaign.channel).toBe(
      "Facebook",
    );

    expect(campaign.status).toBe(
      "planned",
    );

    expect(campaign.budget).toBe(
      1000,
    );

    expect(campaign.leads).toBe(12);
  });

  it("stores a campaign without a client", () => {
    const repository =
      new CampaignRepository();

    createCampaign(repository);

    const campaign =
      repository.get("campaign-1");

    expect(
      campaign.clientId,
    ).toBeUndefined();
  });

  it("lists campaigns for one client", () => {
    const repository =
      new CampaignRepository();

    createCampaign(repository, {
      id: "campaign-1",
      clientId: "client-1",
    });

    createCampaign(repository, {
      id: "campaign-2",
      clientId: "client-2",
    });

    createCampaign(repository, {
      id: "campaign-3",
      clientId: "client-1",
    });

    const campaigns =
      repository.findByClientId(
        "client-1",
      );

    expect(campaigns).toHaveLength(2);

    expect(
      campaigns.every(
        (campaign) =>
          campaign.clientId ===
          "client-1",
      ),
    ).toBe(true);
  });

  it("updates a campaign", () => {
    const repository =
      new CampaignRepository();

    createCampaign(repository);

    const existing =
      repository.get("campaign-1");

    const updated =
      repository.update({
        ...existing,

        status: "active",

        spend: 500,

        updatedAt:
          new Date().toISOString(),
      });

    expect(updated.status).toBe(
      "active",
    );

    const stored =
      repository.get("campaign-1");

    expect(stored.status).toBe(
      "active",
    );

    expect(stored.spend).toBe(500);
  });

  it("stores campaign metadata", () => {
    const repository =
      new CampaignRepository();

    createCampaign(repository);

    const campaign =
      repository.get("campaign-1");

    expect(campaign.metadata).toEqual({
      utm: "spring",
    });
  });

  it("deletes a campaign", () => {
    const repository =
      new CampaignRepository();

    createCampaign(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    repository.delete("campaign-1");

    expect(
      repository.list(),
    ).toHaveLength(0);
  });

  it("throws when a campaign is missing", () => {
    const repository =
      new CampaignRepository();

    expect(() =>
      repository.get("missing"),
    ).toThrow(
      'Campaign "missing" was not found.',
    );
  });
});
