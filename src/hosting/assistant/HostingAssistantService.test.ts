import {
  describe,
  expect,
  it,
} from "vitest";

import type { AIService } from "../../ai/AIService";
import { ClientService } from "../../clients/ClientService";
import { TicketService } from "../../support/TicketService";
import { HostingAccountRepository } from "../HostingAccountRepository";
import { HostingAccountService } from "../HostingAccountService";

import type { DnsResolver } from "./HostingDiagnostics";
import { HostingAssistantService } from "./HostingAssistantService";

const healthyDns: DnsResolver = {
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

function setup() {
  const clients =
    new ClientService();

  const hosting =
    new HostingAccountService(
      clients,
      new HostingAccountRepository(),
    );

  return { clients, hosting };
}

describe("HostingAssistantService", () => {
  it("assesses account findings without AI", async () => {
    const { hosting } = setup();

    const account =
      hosting.create({
        domain: "example.com",
        username: "example",
        status: "suspended",
        diskUsedMb: 4900,
        diskLimitMb: 5000,
      });

    const assistant =
      new HostingAssistantService(
        hosting,
        {
          dnsResolver: healthyDns,
        },
      );

    const assessment =
      await assistant.assess(
        account.id,
      );

    const codes =
      assessment.findings.map(
        (finding) => finding.code,
      );

    expect(codes).toContain(
      "ACCOUNT_SUSPENDED",
    );

    expect(codes).toContain(
      "DISK_CRITICAL",
    );

    expect(assessment.aiGenerated)
      .toBe(false);

    expect(
      assessment.recommendation,
    ).toContain(
      "human approval required",
    );

    expect(assessment.summary)
      .toContain("critical");
  });

  it("uses the AI service when available", async () => {
    const { hosting } = setup();

    const account =
      hosting.create({
        domain: "example.com",
        username: "example",
        status: "active",
      });

    const aiService = {
      generate: async () => ({
        provider: "test",
        capability: "writing",
        content:
          "Diagnosis: the site is healthy. No action needed.",
      }),
    } as unknown as AIService;

    const assistant =
      new HostingAssistantService(
        hosting,
        {
          aiService,
          dnsResolver: healthyDns,
        },
      );

    const assessment =
      await assistant.assess(
        account.id,
      );

    expect(assessment.aiGenerated)
      .toBe(true);

    expect(
      assessment.recommendation,
    ).toContain(
      "the site is healthy",
    );
  });

  it("falls back to deterministic advice when AI fails", async () => {
    const { hosting } = setup();

    const account =
      hosting.create({
        domain: "example.com",
        username: "example",
        status: "active",
      });

    const aiService = {
      generate: async () => {
        throw new Error(
          "provider offline",
        );
      },
    } as unknown as AIService;

    const assistant =
      new HostingAssistantService(
        hosting,
        {
          aiService,
          dnsResolver: healthyDns,
        },
      );

    const assessment =
      await assistant.assess(
        account.id,
      );

    expect(assessment.aiGenerated)
      .toBe(false);

    expect(
      assessment.recommendation,
    ).toContain(
      "No automated issues",
    );
  });

  it("includes linked ticket context", async () => {
    const { clients, hosting } =
      setup();

    const client =
      clients.create({
        companyName:
          "Acme Manufacturing",
        primaryContact:
          "Jordan Smith",
      });

    const account =
      hosting.create({
        clientId: client.id,
        domain: "acme.com",
        username: "acme",
        status: "active",
      });

    const ticketService =
      new TicketService(clients);

    const ticket =
      ticketService.create({
        clientId: client.id,
        subject:
          "Website returns 500",
      });

    const assistant =
      new HostingAssistantService(
        hosting,
        {
          ticketService,
          dnsResolver: healthyDns,
        },
      );

    const assessment =
      await assistant.assess(
        account.id,
        ticket.id,
      );

    expect(
      assessment.ticket?.number,
    ).toBe(ticket.number);

    expect(
      assessment.ticket?.subject,
    ).toBe(
      "Website returns 500",
    );
  });

  it("skips DNS checks when no resolver is provided", async () => {
    const { hosting } = setup();

    const account =
      hosting.create({
        domain: "example.com",
        username: "example",
        status: "active",
      });

    const assistant =
      new HostingAssistantService(
        hosting,
      );

    const assessment =
      await assistant.assess(
        account.id,
      );

    expect(assessment.findings)
      .toHaveLength(0);

    expect(assessment.summary)
      .toContain(
        "No issues were detected",
      );
  });

  it("throws for a missing account", async () => {
    const { hosting } = setup();

    const assistant =
      new HostingAssistantService(
        hosting,
      );

    await expect(
      assistant.assess("missing"),
    ).rejects.toThrow(
      'Hosting account "missing" was not found.',
    );
  });
});
