import {
  describe,
  expect,
  it,
} from "vitest";

import { HostingAccountRepository } from "./HostingAccountRepository";
import type { HostingAccountStatus } from "./HostingAccountStatus";

function createAccount(
  repository: HostingAccountRepository,
  overrides: Partial<{
    id: string;
    clientId: string;
    domain: string;
    username: string;
    status: HostingAccountStatus;
  }> = {},
) {
  const now =
    new Date().toISOString();

  return repository.create({
    id:
      overrides.id ??
      "account-1",

    clientId:
      overrides.clientId,

    domain:
      overrides.domain ??
      "example.com",

    username:
      overrides.username ??
      "example",

    plan: "Business",

    status:
      overrides.status ??
      "active",

    server: "web01",

    ipAddress: "203.0.113.10",

    diskUsedMb: 512,

    diskLimitMb: 5120,

    metadata: {
      cpanelPackage:
        "business",
    },

    createdAt: now,
    updatedAt: now,
  });
}

describe("HostingAccountRepository", () => {
  it("stores and retrieves accounts", () => {
    const repository =
      new HostingAccountRepository();

    createAccount(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    const account =
      repository.get("account-1");

    expect(account.domain).toBe(
      "example.com",
    );

    expect(account.username).toBe(
      "example",
    );

    expect(account.status).toBe(
      "active",
    );

    expect(account.diskLimitMb).toBe(
      5120,
    );
  });

  it("stores an account without a client", () => {
    const repository =
      new HostingAccountRepository();

    createAccount(repository);

    const account =
      repository.get("account-1");

    expect(
      account.clientId,
    ).toBeUndefined();
  });

  it("lists accounts for one client", () => {
    const repository =
      new HostingAccountRepository();

    createAccount(repository, {
      id: "account-1",
      clientId: "client-1",
    });

    createAccount(repository, {
      id: "account-2",
      clientId: "client-2",
    });

    createAccount(repository, {
      id: "account-3",
      clientId: "client-1",
    });

    const accounts =
      repository.findByClientId(
        "client-1",
      );

    expect(accounts).toHaveLength(2);

    expect(
      accounts.every(
        (account) =>
          account.clientId ===
          "client-1",
      ),
    ).toBe(true);
  });

  it("updates an account", () => {
    const repository =
      new HostingAccountRepository();

    createAccount(repository);

    const existing =
      repository.get("account-1");

    const updated =
      repository.update({
        ...existing,

        status: "suspended",

        notes:
          "Suspended for non-payment.",

        updatedAt:
          new Date().toISOString(),
      });

    expect(updated.status).toBe(
      "suspended",
    );

    const stored =
      repository.get("account-1");

    expect(stored.status).toBe(
      "suspended",
    );

    expect(stored.notes).toBe(
      "Suspended for non-payment.",
    );
  });

  it("stores account metadata", () => {
    const repository =
      new HostingAccountRepository();

    createAccount(repository);

    const account =
      repository.get("account-1");

    expect(account.metadata).toEqual({
      cpanelPackage: "business",
    });
  });

  it("deletes an account", () => {
    const repository =
      new HostingAccountRepository();

    createAccount(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    repository.delete("account-1");

    expect(
      repository.list(),
    ).toHaveLength(0);
  });

  it("throws when an account is missing", () => {
    const repository =
      new HostingAccountRepository();

    expect(() =>
      repository.get("missing"),
    ).toThrow(
      'Hosting account "missing" was not found.',
    );
  });
});
