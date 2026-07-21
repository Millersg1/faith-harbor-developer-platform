import { randomUUID } from "node:crypto";

import type { InvoiceRecord } from "../../accounting/InvoiceRecord";
import type { InvoiceService } from "../../accounting/InvoiceService";
import type { HostingPlanService } from "../plans/HostingPlanService";
import type { ProvisioningService } from "../provisioning/ProvisioningService";
import { HostingOrderRepository } from "./HostingOrderRepository";
import type {
  CreateHostingOrderRequest,
  HostingOrderRecord,
} from "./HostingOrderTypes";

/**
 * Turns a hosting order into an invoice, and — when that invoice is
 * paid — provisions the account automatically. This is the hands-off
 * path: pay → account created → welcome email, with no manual step.
 */
export class HostingOrderService {
  constructor(
    private readonly plans: HostingPlanService,
    private readonly invoices: InvoiceService,
    private readonly provisioning: ProvisioningService,
    private readonly repository =
      new HostingOrderRepository(),
    private readonly logger: {
      error: (
        message: string,
        error: unknown,
      ) => void;
    } = {
      error: (message, error) =>
        console.error(message, error),
    },
  ) {}

  /**
   * Creates a hosting order and its invoice. The invoice starts as
   * "sent" so it can be paid immediately; paying it triggers
   * provisioning.
   */
  createOrder(
    request: CreateHostingOrderRequest,
  ): {
    order: HostingOrderRecord;
    invoice: InvoiceRecord;
  } {
    const domain = request.domain
      .trim()
      .toLowerCase();

    const contactEmail =
      request.contactEmail.trim();

    if (!request.clientId) {
      throw new Error(
        "A hosting order requires a client.",
      );
    }

    if (!domain) {
      throw new Error(
        "A hosting order requires a domain.",
      );
    }

    if (!contactEmail) {
      throw new Error(
        "A hosting order requires a contact email.",
      );
    }

    const plan = request.planId
      ? this.plans.get(request.planId)
      : request.planSlug
        ? this.plans.getBySlug(
            request.planSlug,
          )
        : undefined;

    if (!plan) {
      throw new Error(
        "The hosting plan was not found.",
      );
    }

    const billingCycle =
      request.billingCycle ?? "monthly";

    const priceCents =
      billingCycle === "yearly"
        ? plan.priceYearlyCents
        : plan.priceMonthlyCents;

    const now =
      new Date().toISOString();

    const orderId = randomUUID();

    const invoice =
      this.invoices.create({
        clientId: request.clientId,
        status: "sent",
        lineItems: [
          {
            description: `${plan.name} hosting (${billingCycle}) — ${domain}`,
            quantity: 1,
            // Invoice amounts are in dollars; plan prices are cents.
            unitPrice: priceCents / 100,
          },
        ],
        metadata: {
          hostingOrderId: orderId,
        },
      });

    const order: HostingOrderRecord = {
      id: orderId,
      clientId: request.clientId,
      planId: plan.id,
      domain,
      contactEmail,
      billingCycle,
      invoiceId: invoice.id,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    if (request.brandId) {
      order.brandId = request.brandId;
    }

    this.repository.create(order);

    return { order, invoice };
  }

  /**
   * Provisions the account for a paid invoice's order. Safe to call for
   * any invoice: it only acts on a matching, still-pending order, so a
   * repeated payment webhook never double-provisions.
   */
  async handleInvoicePaid(
    invoiceId: string,
  ): Promise<void> {
    const order =
      this.repository.findByInvoiceId(
        invoiceId,
      );

    if (
      !order ||
      order.status !== "pending"
    ) {
      return;
    }

    try {
      const result =
        await this.provisioning.provision(
          {
            planId: order.planId,
            domain: order.domain,
            contactEmail:
              order.contactEmail,
            clientId: order.clientId,
            brandId: order.brandId,
          },
        );

      this.repository.update({
        ...order,
        status: "provisioned",
        username:
          result.account.username,
        updatedAt:
          new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Auto-provisioning failed for order ${order.id}.`,
        error,
      );

      this.repository.update({
        ...order,
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Provisioning failed.",
        updatedAt:
          new Date().toISOString(),
      });
    }
  }

  get(
    id: string,
  ): HostingOrderRecord | undefined {
    return this.repository
      .list()
      .find((order) => order.id === id);
  }

  list(): readonly HostingOrderRecord[] {
    return this.repository.list();
  }
}
