import {
  describe,
  expect,
  it,
} from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { PlatformClientRepository } from "../clients/PlatformClientRepository";
import { PlatformClientService } from "../clients/PlatformClientService";
import { PlatformInvoiceRepository } from "./PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./PlatformInvoiceService";

const A = { organizationId: "org-a" };
const B = { organizationId: "org-b" };

function setup() {
  const clients =
    new PlatformClientService(
      new PlatformClientRepository(),
    );

  const invoices =
    new PlatformInvoiceService(
      new PlatformInvoiceRepository(),
      clients,
    );

  return { clients, invoices };
}

const items = [
  {
    description: "Design",
    quantity: 2,
    unitPrice: 10,
  },
  {
    description: "Hosting",
    quantity: 1,
    unitPrice: 5,
  },
];

describe("PlatformInvoice tenant isolation", () => {
  it("fails closed without a tenant", async () => {
    const { invoices } = setup();

    await expect(
      invoices.create({
        lineItems: items,
      }),
    ).rejects.toThrow(/no tenant/i);

    await expect(
      invoices.list(),
    ).rejects.toThrow(/no tenant/i);
  });

  it("requires at least one line item", async () => {
    const { invoices } = setup();

    await expect(
      runWithTenant(A, () =>
        invoices.create({
          lineItems: [],
        }),
      ),
    ).rejects.toThrow(
      /at least one line item/i,
    );
  });

  it("computes the amount from the line items", async () => {
    const { invoices } = setup();

    const invoice =
      await runWithTenant(A, () =>
        invoices.create({
          lineItems: items,
        }),
      );

    // 2*10 + 1*5 = 25
    expect(invoice.amount).toBe(25);
  });

  it("numbers invoices per tenant, each starting at INV-0001", async () => {
    const { invoices } = setup();

    const a1 = await runWithTenant(
      A,
      () =>
        invoices.create({
          lineItems: items,
        }),
    );
    const a2 = await runWithTenant(
      A,
      () =>
        invoices.create({
          lineItems: items,
        }),
    );
    const b1 = await runWithTenant(
      B,
      () =>
        invoices.create({
          lineItems: items,
        }),
    );

    expect(a1.number).toBe("INV-0001");
    expect(a2.number).toBe("INV-0002");
    // B's sequence is independent of A's.
    expect(b1.number).toBe("INV-0001");
  });

  it("isolates each tenant's invoices", async () => {
    const { invoices } = setup();

    await runWithTenant(A, () =>
      invoices.create({
        lineItems: items,
      }),
    );
    await runWithTenant(B, () =>
      invoices.create({
        lineItems: items,
      }),
    );

    const aList =
      await runWithTenant(A, () =>
        invoices.list(),
      );
    const bList =
      await runWithTenant(B, () =>
        invoices.list(),
      );

    expect(aList).toHaveLength(1);
    expect(bList).toHaveLength(1);
    expect(
      aList[0].organizationId,
    ).toBe("org-a");
    expect(
      bList[0].organizationId,
    ).toBe("org-b");
  });

  it("cannot read, update, or delete another tenant's invoice", async () => {
    const { invoices } = setup();

    const a = await runWithTenant(
      A,
      () =>
        invoices.create({
          lineItems: items,
        }),
    );

    await expect(
      runWithTenant(B, () =>
        invoices.get(a.id),
      ),
    ).rejects.toThrow(/not found/i);

    await expect(
      runWithTenant(B, () =>
        invoices.update(a.id, {
          status: "paid",
        }),
      ),
    ).rejects.toThrow(/not found/i);

    await runWithTenant(B, () =>
      invoices.delete(a.id),
    );

    const stillThere =
      await runWithTenant(A, () =>
        invoices.get(a.id),
      );
    expect(stillThere.id).toBe(a.id);
  });

  it("cannot bill another tenant's client", async () => {
    const { clients, invoices } =
      setup();

    const bClient = await runWithTenant(
      B,
      () =>
        clients.create({
          name: "B Client",
        }),
    );

    await expect(
      runWithTenant(A, () =>
        invoices.create({
          clientId: bClient.id,
          lineItems: items,
        }),
      ),
    ).rejects.toThrow(/not found/i);
  });

  it("recomputes the amount on update", async () => {
    const { invoices } = setup();

    const a = await runWithTenant(
      A,
      () =>
        invoices.create({
          lineItems: items,
        }),
    );

    const updated =
      await runWithTenant(A, () =>
        invoices.update(a.id, {
          lineItems: [
            {
              description: "Retainer",
              quantity: 3,
              unitPrice: 100,
            },
          ],
          status: "sent",
        }),
      );

    expect(updated.amount).toBe(300);
    expect(updated.status).toBe(
      "sent",
    );
  });
});
