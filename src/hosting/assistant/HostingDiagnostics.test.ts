import {
  describe,
  expect,
  it,
} from "vitest";

import type { HostingAccountRecord } from "../HostingAccountRecord";

import {
  runAccountChecks,
  runDnsChecks,
  type DnsResolver,
} from "./HostingDiagnostics";

function account(
  overrides: Partial<HostingAccountRecord> = {},
): HostingAccountRecord {
  const now =
    new Date().toISOString();

  return {
    id: "account-1",
    domain: "example.com",
    username: "example",
    status: "active",
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("runAccountChecks", () => {
  it("flags a suspended account", () => {
    const findings =
      runAccountChecks(
        account({
          status: "suspended",
        }),
      );

    expect(
      findings.map((f) => f.code),
    ).toContain(
      "ACCOUNT_SUSPENDED",
    );

    expect(findings[0]?.severity)
      .toBe("critical");
  });

  it("flags a pending account", () => {
    const findings =
      runAccountChecks(
        account({
          status: "pending",
        }),
      );

    expect(
      findings.map((f) => f.code),
    ).toContain(
      "ACCOUNT_PENDING",
    );
  });

  it("flags critical disk usage", () => {
    const findings =
      runAccountChecks(
        account({
          diskUsedMb: 4800,
          diskLimitMb: 5000,
        }),
      );

    expect(
      findings.map((f) => f.code),
    ).toContain("DISK_CRITICAL");
  });

  it("flags a disk warning", () => {
    const findings =
      runAccountChecks(
        account({
          diskUsedMb: 4100,
          diskLimitMb: 5000,
        }),
      );

    expect(
      findings.map((f) => f.code),
    ).toContain("DISK_WARNING");
  });

  it("returns no findings for a healthy account", () => {
    const findings =
      runAccountChecks(
        account({
          status: "active",
          diskUsedMb: 100,
          diskLimitMb: 5000,
        }),
      );

    expect(findings).toHaveLength(0);
  });
});

describe("runDnsChecks", () => {
  it("flags a missing A record", async () => {
    const resolver: DnsResolver = {
      resolveA: async () => [],
      resolveMx: async () => [
        {
          exchange: "mail",
          priority: 10,
        },
      ],
    };

    const findings =
      await runDnsChecks(
        "example.com",
        resolver,
      );

    expect(
      findings.map((f) => f.code),
    ).toContain(
      "DNS_NO_A_RECORD",
    );
  });

  it("flags an A lookup failure", async () => {
    const resolver: DnsResolver = {
      resolveA: async () => {
        throw new Error("ENOTFOUND");
      },
      resolveMx: async () => [
        {
          exchange: "mail",
          priority: 10,
        },
      ],
    };

    const findings =
      await runDnsChecks(
        "missing.invalid",
        resolver,
      );

    expect(
      findings.map((f) => f.code),
    ).toContain(
      "DNS_A_LOOKUP_FAILED",
    );
  });

  it("flags missing MX records", async () => {
    const resolver: DnsResolver = {
      resolveA: async () => [
        "203.0.113.10",
      ],
      resolveMx: async () => [],
    };

    const findings =
      await runDnsChecks(
        "example.com",
        resolver,
      );

    expect(
      findings.map((f) => f.code),
    ).toContain(
      "DNS_NO_MX_RECORD",
    );
  });

  it("returns no findings for healthy DNS", async () => {
    const resolver: DnsResolver = {
      resolveA: async () => [
        "203.0.113.10",
      ],
      resolveMx: async () => [
        {
          exchange: "mail.example.com",
          priority: 10,
        },
      ],
    };

    const findings =
      await runDnsChecks(
        "example.com",
        resolver,
      );

    expect(findings).toHaveLength(0);
  });
});
