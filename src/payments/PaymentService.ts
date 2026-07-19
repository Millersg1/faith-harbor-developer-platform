import { randomUUID } from "node:crypto";

import type { InvoiceService } from "../accounting/InvoiceService";

import { PaymentRepository } from "./PaymentRepository";
import type {
  PaymentIntegrationStatus,
  PaymentRecord,
} from "./PaymentTypes";
import {
  DisconnectedStripeGateway,
  type StripeGateway,
} from "./StripeGateway";

export interface WebhookResult {
  handled: boolean;
  reason?: string;
}

/**
 * Creates Stripe checkout links for invoices and marks invoices paid
 * when Stripe confirms payment.
 */
export class PaymentService {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly gateway: StripeGateway =
      new DisconnectedStripeGateway(),
    private readonly repository =
      new PaymentRepository(),
    private readonly baseUrl = "",
  ) {}

  /**
   * Creates a hosted checkout link for an invoice.
   */
  async createCheckout(
    invoiceId: string,
  ): Promise<PaymentRecord> {
    const invoice =
      this.invoices.get(invoiceId);

    if (invoice.status === "paid") {
      throw new Error(
        "This invoice is already paid.",
      );
    }

    if (invoice.amount <= 0) {
      throw new Error(
        "This invoice has no balance to collect.",
      );
    }

    if (!this.baseUrl) {
      throw new Error(
        "Set APP_URL so payment receipts can redirect back to the app.",
      );
    }

    const session =
      await this.gateway.createCheckout(
        {
          amount: invoice.amount,
          currency: invoice.currency,
          description: `Invoice ${invoice.number}`,
          invoiceId: invoice.id,
          successUrl: `${this.baseUrl}/accounting?paid=${invoice.number}`,
          cancelUrl: `${this.baseUrl}/accounting?canceled=${invoice.number}`,
        },
      );

    const record: PaymentRecord = {
      id: randomUUID(),
      invoiceId: invoice.id,
      clientId: invoice.clientId,
      amount: invoice.amount,
      currency: invoice.currency,
      status: "pending",
      sessionId: session.id,
      checkoutUrl: session.url,
      createdAt:
        new Date().toISOString(),
    };

    return this.repository.create(
      record,
    );
  }

  /**
   * Handles a Stripe webhook: verifies the signature, and on a
   * completed checkout marks the payment and its invoice paid.
   */
  handleWebhook(
    rawBody: string,
    signatureHeader: string | undefined,
  ): WebhookResult {
    const verified =
      this.gateway.verifyWebhook(
        rawBody,
        signatureHeader,
      );

    if (!verified) {
      return {
        handled: false,
        reason: "invalid signature",
      };
    }

    let event: {
      type?: string;
      data?: {
        object?: {
          id?: string;
          client_reference_id?: string;
          metadata?: {
            invoiceId?: string;
          };
        };
      };
    };

    try {
      event = JSON.parse(rawBody);
    } catch {
      return {
        handled: false,
        reason: "invalid payload",
      };
    }

    if (
      event.type !==
      "checkout.session.completed"
    ) {
      // Acknowledge other events without acting on them.
      return { handled: true };
    }

    const object =
      event.data?.object;

    const invoiceId =
      object?.client_reference_id ??
      object?.metadata?.invoiceId;

    if (!invoiceId) {
      return {
        handled: false,
        reason: "no invoice reference",
      };
    }

    this.markPaid(
      invoiceId,
      object?.id,
    );

    return { handled: true };
  }

  list(): readonly PaymentRecord[] {
    return this.repository.list();
  }

  listForInvoice(
    invoiceId: string,
  ): readonly PaymentRecord[] {
    return this.repository.findByInvoice(
      invoiceId,
    );
  }

  integrationStatus():
    PaymentIntegrationStatus {
    const connected =
      this.gateway.isConnected();

    return {
      connected,
      message: connected
        ? "Stripe is connected. You can collect payments on invoices."
        : "Connect Stripe (STRIPE_SECRET_KEY) to collect card payments on invoices.",
    };
  }

  /**
   * Marks a payment and its invoice paid. Best-effort and idempotent:
   * a repeated webhook simply confirms the same state.
   */
  private markPaid(
    invoiceId: string,
    sessionId?: string,
  ): void {
    const now =
      new Date().toISOString();

    if (sessionId) {
      const payment =
        this.repository.findBySession(
          sessionId,
        );

      if (
        payment &&
        payment.status !== "paid"
      ) {
        this.repository.update({
          ...payment,
          status: "paid",
          paidAt: now,
        });
      }
    }

    try {
      const invoice =
        this.invoices.get(invoiceId);

      if (invoice.status !== "paid") {
        this.invoices.update({
          ...invoice,
          status: "paid",
          paidDate: now,
        });
      }
    } catch {
      // The invoice may have been deleted; the payment record stands.
    }
  }
}
