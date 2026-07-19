import {
  describe,
  expect,
  it,
} from "vitest";

import { ClientService } from "../clients/ClientService";

import { HostingAccountRepository } from "./HostingAccountRepository";
import { HostingAccountService } from "./HostingAccountService";

function createHostingService() {
  const clients =
    new ClientService();

  const repository =
    new HostingAccountRepository();

  const service =
    new HostingAccountService(
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

describe("HostingAccountService", () => {
  it("creates and saves an account linked to a client", () => {
    const {
      service,
      clients,
    } = createHostingService();

    const client =
      createClient(clients);

    const account =
      service.create({
        clientId: client.id,

        domain:
          "  faithharbor.org  ",

        username:
          "  faithharbor  ",

        plan: "Business",

        status: "active",

        metadata: {
          region: "us-east",
        },
      });

    expect(account.id)
      .toBeDefined();

    expect(account.clientId)
      .toBe(client.id);

    expect(account.domain)
      .toBe("faithharbor.org");

    expect(account.username)
      .toBe("faithharbor");

    expect(account.status)
      .toBe("active");

    expect(account.metadata)
      .toEqual({
        region: "us-east",
      });

    expect(service.list())
      .toEqual([account]);
  });

  it("creates an account without a client", () => {
    const {
      service,
    } = createHostingService();

    const account =
      service.create({
        domain: "example.com",
        username: "example",
      });

    expect(account.clientId)
      .toBeUndefined();

    expect(account.status)
      .toBe("pending");
  });

  it("defaults status to pending", () => {
    const {
      service,
    } = createHostingService();

    const account =
      service.create({
        domain: "example.net",
        username: "examplenet",
      });

    expect(account.status)
      .toBe("pending");
  });

  it("lists accounts for one client", () => {
    const {
      service,
      clients,
    } = createHostingService();

    const firstClient =
      createClient(
        clients,
        "Acme Manufacturing",
      );

    const secondClient =
      createClient(
        clients,
        "Faith Harbor LLC",
      );

    const firstAccount =
      service.create({
        clientId:
          firstClient.id,
        domain: "acme.com",
        username: "acme",
      });

    service.create({
      clientId:
        secondClient.id,
      domain: "faithharbor.org",
      username: "faithharbor",
    });

    const thirdAccount =
      service.create({
        clientId:
          firstClient.id,
        domain: "acme.net",
        username: "acmenet",
      });

    expect(
      service.listForClient(
        firstClient.id,
      ),
    ).toEqual([
      firstAccount,
      thirdAccount,
    ]);
  });

  it("updates an account", () => {
    const {
      service,
    } = createHostingService();

    const account =
      service.create({
        domain: "example.com",
        username: "example",
        status: "active",
      });

    const updated =
      service.update({
        ...account,

        status: "suspended",

        notes: "Over quota.",
      });

    expect(updated.status)
      .toBe("suspended");

    expect(
      service.get(account.id)
        .status,
    ).toBe("suspended");
  });

  it("deletes an account", () => {
    const {
      service,
    } = createHostingService();

    const account =
      service.create({
        domain: "example.com",
        username: "example",
      });

    expect(service.list())
      .toHaveLength(1);

    service.delete(account.id);

    expect(service.list())
      .toHaveLength(0);
  });

  it("rejects an account with no domain", () => {
    const {
      service,
    } = createHostingService();

    expect(() =>
      service.create({
        domain: "   ",
        username: "example",
      }),
    ).toThrow(
      "A hosting account requires a domain.",
    );
  });

  it("rejects an account for a missing client", () => {
    const {
      service,
    } = createHostingService();

    expect(() =>
      service.create({
        clientId:
          "missing-client",
        domain: "example.com",
        username: "example",
      }),
    ).toThrow(
      'Client "missing-client" was not found.',
    );

    expect(service.list())
      .toHaveLength(0);
  });
});
