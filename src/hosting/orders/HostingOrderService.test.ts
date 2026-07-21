import {
  describe,
  expect,
  it,
} from "vitest";

import { InvoiceService } from "../../accounting/InvoiceService";
import { ClientService } from "../../clients/ClientService";
import { EmailService } from "../../communications/EmailService";
import { LoggingEmailTransport } from "../../communications/EmailTransport";
import { HostingAccountService } from "../HostingAccountService";
import { HostingPlanService } from "../plans/HostingPlanService";
import { ProvisioningService } from "../provisioning/ProvisioningService";
import type {
  WHMClient,
  WHMCreateAccountRequest,
} from "../whm/WHMClient";
import { HostingOrderService } from "./HostingOrderService";

function build() {
  const clients = new ClientService();
  const invoices = new InvoiceService(
    clients,
  );
  const plans = new HostingPlanService();
  plans.seedDefaults();

  const emails = new EmailService(
    new LoggingEmailTransport(),
    "system@faithharbor.test",
  );

  const hostingAccounts =
    new HostingAccountService(
      clients,
      undefined,
    );

  const createCalls: WHMCreateAccountRequest[] =
    [];

  const whm = {
    async listPackages() {
      return ["root_Starter_NVMe"];
    },
    async createPackage() {},
    async createAccount(
      request: WHMCreateAccountRequest,
    ) {
      createCalls.push(request);
      return {
        username: request.username,
        domain: request.domain,
        ipAddress: "203.0.113.9",
      };
    },
  } as unknown as WHMClient;

  const provisioning =
    new ProvisioningService(
      plans,
      hostingAccounts,
      whm,
      emails,
      {
        clients,
        serverLabel:
          "server.example.com",
      },
    );

  const orders =
    new HostingOrderService(
      plans,
      invoices,
      provisioning,
    );

  const client = clients.create({
    companyName: "Grace Chapel",
    primaryContact: "Pastor John",
    email: "pastor@gracechapel.org",
  });

  return {
    orders,
    invoices,
    emails,
    hostingAccounts,
    client,
    createCalls,
  };
}

describe("HostingOrderService", () => {
  it("creates an order with a matching invoice", () => {
    const { orders, client } = build();

    const { order, invoice } =
      orders.createOrder({
        clientId: client.id,
        planSlug: "starter-nvme",
        domain: "GraceChapel.org",
        contactEmail:
          "pastor@gracechapel.org",
      });

    expect(order.status).toBe(
      "pending",
    );
    expect(order.domain).toBe(
      "gracechapel.org",
    );
    expect(order.invoiceId).toBe(
      invoice.id,
    );
    // Starter is $4.99/mo.
    expect(invoice.amount).toBe(4.99);
    expect(invoice.status).toBe("sent");
  });

  it("auto-provisions when the invoice is paid, once", async () => {
    const {
      orders,
      emails,
      hostingAccounts,
      client,
      createCalls,
    } = build();

    const { order, invoice } =
      orders.createOrder({
        clientId: client.id,
        planSlug: "starter-nvme",
        domain: "gracechapel.org",
        contactEmail:
          "pastor@gracechapel.org",
      });

    await orders.handleInvoicePaid(
      invoice.id,
    );

    const updated = orders.get(order.id);
    expect(updated?.status).toBe(
      "provisioned",
    );
    expect(
      updated?.username,
    ).toBeTruthy();

    // A real account was recorded and the welcome email sent.
    expect(
      hostingAccounts.list(),
    ).toHaveLength(1);
    expect(emails.list()).toHaveLength(
      1,
    );

    // Paying again (repeat webhook) never double-provisions.
    await orders.handleInvoicePaid(
      invoice.id,
    );
    expect(createCalls).toHaveLength(1);
    expect(
      hostingAccounts.list(),
    ).toHaveLength(1);
  });

  it("ignores payment for an unrelated invoice", async () => {
    const {
      orders,
      createCalls,
      client,
    } = build();

    orders.createOrder({
      clientId: client.id,
      planSlug: "starter-nvme",
      domain: "gracechapel.org",
      contactEmail:
        "pastor@gracechapel.org",
    });

    await orders.handleInvoicePaid(
      "some-other-invoice",
    );

    expect(createCalls).toHaveLength(0);
  });
});
