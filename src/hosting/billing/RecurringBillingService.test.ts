import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ClientService } from "../../clients/ClientService";
import type { EmailService } from "../../communications/EmailService";
import { InvoiceService } from "../../accounting/InvoiceService";
import { HostingAccountService } from "../HostingAccountService";
import { HostingOrderRepository } from "../orders/HostingOrderRepository";
import type { HostingOrderRecord } from "../orders/HostingOrderTypes";
import { HostingPlanRepository } from "../plans/HostingPlanRepository";
import { HostingPlanService } from "../plans/HostingPlanService";
import type { ProvisioningService } from "../provisioning/ProvisioningService";
import {
  addBillingPeriod,
  daysBetween,
} from "./billingPeriod";
import { RecurringBillingService } from "./RecurringBillingService";

const DAY = 24 * 60 * 60 * 1000;
const START = "2026-03-01T00:00:00.000Z";

function iso(base: string, addDays: number): string {
  return new Date(
    new Date(base).getTime() +
      addDays * DAY,
  ).toISOString();
}

function setup(
  options: {
    autoSuspend?: boolean;
  } = {},
) {
  const clients = new ClientService();
  const client = clients.create({
    companyName: "Acme",
    primaryContact: "Pat",
    email: "pat@acme.com",
  });

  const invoices = new InvoiceService(
    clients,
  );

  const plans = new HostingPlanService(
    new HostingPlanRepository(),
  );
  plans.seedDefaults();
  const plan = plans.getBySlug(
    "starter-nvme",
  );

  if (!plan) {
    throw new Error(
      "expected seeded starter plan",
    );
  }

  const accounts =
    new HostingAccountService(clients);

  const orders =
    new HostingOrderRepository();

  const sent: Array<{
    to: string;
    subject: string;
    from?: string;
  }> = [];

  const emails = {
    send: vi.fn(
      async (req: {
        to: string;
        subject: string;
        from?: string;
      }) => {
        sent.push(req);
        return req;
      },
    ),
  };

  // A provisioning fake that mirrors the real suspend/unsuspend: it
  // flips the local account status (as the real service does).
  const suspend = vi.fn(
    async (
      account: ReturnType<
        HostingAccountService["get"]
      >,
    ) =>
      accounts.update({
        ...account,
        status: "suspended",
      }),
  );

  const unsuspend = vi.fn(
    async (
      account: ReturnType<
        HostingAccountService["get"]
      >,
    ) =>
      accounts.update({
        ...account,
        status: "active",
      }),
  );

  const provisioning = {
    isAvailable: () => true,
    suspend,
    unsuspend,
  } as unknown as ProvisioningService;

  let clock = new Date(START);

  const service =
    new RecurringBillingService(
      orders,
      plans,
      invoices,
      provisioning,
      accounts,
      emails as unknown as EmailService,
      {
        renewalLeadDays: 7,
        graceDays: 7,
        autoSuspend:
          options.autoSuspend ?? true,
        appUrl:
          "https://os.example.com",
        now: () => clock,
        logger: {
          error: () => {},
        },
      },
    );

  function seedOrder(
    overrides: Partial<HostingOrderRecord> = {},
  ): {
    order: HostingOrderRecord;
    account: ReturnType<
      HostingAccountService["create"]
    >;
  } {
    const account = accounts.create({
      clientId: client.id,
      domain: "acme.com",
      username: "acme123",
      plan: plan.name,
      status: "active",
    });

    const order: HostingOrderRecord = {
      id: "order-1",
      clientId: client.id,
      planId: plan.id,
      domain: "acme.com",
      contactEmail: "pat@acme.com",
      billingCycle: "monthly",
      invoiceId: "inv-original",
      status: "provisioned",
      username: "acme123",
      autoRenew: true,
      nextDueDate: iso(START, 5),
      createdAt: START,
      updatedAt: START,
      ...overrides,
    };

    orders.create(order);

    return { order, account };
  }

  return {
    clients,
    client,
    invoices,
    plans,
    plan,
    accounts,
    orders,
    emails,
    sent,
    suspend,
    unsuspend,
    service,
    seedOrder,
    setClock: (date: string) => {
      clock = new Date(date);
    },
  };
}

describe("Billing period math", () => {
  it("adds a month and clamps to the end of a short month", () => {
    expect(
      addBillingPeriod(
        "2026-01-31T00:00:00.000Z",
        "monthly",
      ),
    ).toBe(
      "2026-02-28T00:00:00.000Z",
    );
  });

  it("adds a year", () => {
    expect(
      addBillingPeriod(
        "2026-03-01T00:00:00.000Z",
        "yearly",
      ),
    ).toBe(
      "2027-03-01T00:00:00.000Z",
    );
  });

  it("counts whole days between instants", () => {
    expect(
      daysBetween(
        new Date(START),
        new Date(iso(START, 3)),
      ),
    ).toBe(3);
  });
});

describe("RecurringBillingService", () => {
  it("does not invoice before the renewal lead window", async () => {
    const t = setup();
    t.seedOrder({
      nextDueDate: iso(START, 30),
    });

    const actions =
      await t.service.runBillingCycle();

    expect(actions).toBe(0);
    expect(
      t.invoices.list(),
    ).toHaveLength(0);
    expect(
      t.emails.send,
    ).not.toHaveBeenCalled();
  });

  it("raises a renewal invoice and emails within the lead window", async () => {
    const t = setup();
    t.seedOrder({
      nextDueDate: iso(START, 5),
    });

    const actions =
      await t.service.runBillingCycle();

    expect(actions).toBe(1);

    const invoices = t.invoices.list();
    expect(invoices).toHaveLength(1);
    expect(
      invoices[0].status,
    ).toBe("sent");
    expect(
      invoices[0].metadata
        ?.hostingOrderId,
    ).toBe("order-1");
    expect(
      invoices[0].dueDate,
    ).toBe(iso(START, 5));

    // The order now points at the outstanding renewal invoice.
    const order = t.orders.list()[0];
    expect(
      order.renewalInvoiceId,
    ).toBe(invoices[0].id);
    expect(
      order.lastReminderStage,
    ).toBe(1);

    expect(
      t.emails.send,
    ).toHaveBeenCalledTimes(1);
    expect(
      t.sent[0].subject,
    ).toContain("renews soon");
  });

  it("does not raise a second invoice while one is outstanding", async () => {
    const t = setup();
    t.seedOrder({
      nextDueDate: iso(START, 5),
    });

    await t.service.runBillingCycle();
    const again =
      await t.service.runBillingCycle();

    expect(again).toBe(0);
    expect(
      t.invoices.list(),
    ).toHaveLength(1);
  });

  it("sends an escalating overdue reminder once per stage", async () => {
    const t = setup();
    t.seedOrder({
      nextDueDate: iso(START, 0),
    });

    // Raise the invoice (stage 1, "upcoming").
    await t.service.runBillingCycle();
    expect(
      t.emails.send,
    ).toHaveBeenCalledTimes(1);

    // One day past due -> stage 2 overdue reminder.
    t.setClock(iso(START, 1));
    const overdue =
      await t.service.runBillingCycle();
    expect(overdue).toBe(1);
    expect(
      t.emails.send,
    ).toHaveBeenCalledTimes(2);
    expect(
      t.sent[1].subject,
    ).toContain("Payment due");

    // Same day again -> no duplicate reminder.
    const dup =
      await t.service.runBillingCycle();
    expect(dup).toBe(0);
    expect(
      t.emails.send,
    ).toHaveBeenCalledTimes(2);
  });

  it("suspends the account after the grace period and reactivates on payment", async () => {
    const t = setup();
    const { account } = t.seedOrder({
      nextDueDate: iso(START, 0),
    });

    // Raise the renewal invoice.
    await t.service.runBillingCycle();
    const renewalInvoiceId =
      t.orders.list()[0]
        .renewalInvoiceId as string;

    // Move to 7 days past due (grace = 7) and run: suspend fires.
    t.setClock(iso(START, 7));
    await t.service.runBillingCycle();

    expect(
      t.suspend,
    ).toHaveBeenCalledTimes(1);
    expect(
      t.accounts.get(account.id)
        .status,
    ).toBe("suspended");
    expect(
      t.sent.some((m) =>
        m.subject.includes(
          "has been suspended",
        ),
      ),
    ).toBe(true);

    // Running again does not suspend a second time.
    await t.service.runBillingCycle();
    expect(
      t.suspend,
    ).toHaveBeenCalledTimes(1);

    // Payment arrives -> reactivate + advance the term.
    const handled =
      await t.service.handleRenewalPayment(
        renewalInvoiceId,
      );

    expect(handled).toBe(true);
    expect(
      t.unsuspend,
    ).toHaveBeenCalledTimes(1);
    expect(
      t.accounts.get(account.id)
        .status,
    ).toBe("active");

    const order = t.orders.list()[0];
    expect(
      order.renewalInvoiceId,
    ).toBeUndefined();
    expect(
      order.lastReminderStage,
    ).toBe(0);
    // Term advanced one month from the original due date.
    expect(order.nextDueDate).toBe(
      addBillingPeriod(
        iso(START, 0),
        "monthly",
      ),
    );
    expect(
      t.sent.some((m) =>
        m.subject.includes(
          "back online",
        ),
      ),
    ).toBe(true);
  });

  it("never suspends when auto-suspend is disabled", async () => {
    const t = setup({
      autoSuspend: false,
    });
    const { account } = t.seedOrder({
      nextDueDate: iso(START, 0),
    });

    await t.service.runBillingCycle();
    t.setClock(iso(START, 30));
    await t.service.runBillingCycle();

    expect(
      t.suspend,
    ).not.toHaveBeenCalled();
    expect(
      t.accounts.get(account.id)
        .status,
    ).toBe("active");
  });

  it("ignores orders that are not auto-renewing or not provisioned", async () => {
    const t = setup();
    t.seedOrder({
      id: "order-1",
      autoRenew: false,
      nextDueDate: iso(START, 1),
    });

    const actions =
      await t.service.runBillingCycle();

    expect(actions).toBe(0);
    expect(
      t.invoices.list(),
    ).toHaveLength(0);
  });

  it("returns false for a payment that is not a renewal", async () => {
    const t = setup();
    t.seedOrder();

    const handled =
      await t.service.handleRenewalPayment(
        "some-unrelated-invoice",
      );

    expect(handled).toBe(false);
  });
});
