import { randomUUID } from "node:crypto";

import type { InvoiceService } from "../accounting/InvoiceService";

import { PaymentRepository } from "./PaymentRepository";
import type {
  PaymentIntegrationStatus,
  PaymentProvider,
  PaymentRecord,
} from "./PaymentTypes";
import {
  DisconnectedPayPalGateway,
  type PayPalGateway,
} from "./PayPalGateway";
import {
  DisconnectedStripeGateway,
  type StripeGateway,
} from "./StripeGateway";

export interface WebhookResult {
  handled: boolean;
  reason?: string;
}

export interface CaptureOutcome {
  completed: boolean;
  invoiceId?: string;
}

/**
 * Creates checkout links for invoices (Stripe or PayPal) and marks
 * invoices paid when the provider confirms payment.
 */
export class PaymentService {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly gateway: StripeGateway =
      new DisconnectedStripeGateway(),
    private readonly repository =
      new PaymentRepository(),
    private readonly baseUrl = "",
    private readonly paypal: PayPalGateway =
      new DisconnectedPayPalGateway(),
  ) {}

  /**
   * Creates a hosted checkout link for an invoice with the chosen
   * provider (defaults to Stripe).
   */
  async createCheckout(
    invoiceId: string,
    provider: PaymentProvider = "stripe",
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

    // PayPal redirects the payer back to our capture route; Stripe
    // confirms out-of-band via webhook and just needs a landing page.
    const successUrl =
      provider === "paypal"
        ? `${this.baseUrl}/payments/paypal/return`
        : `${this.baseUrl}/accounting?paid=${invoice.number}`;

    const cancelUrl =
      provider === "paypal"
        ? `${this.baseUrl}/?payment=cancelled`
        : `${this.baseUrl}/accounting?canceled=${invoice.number}`;

    const gateway =
      provider === "paypal"
        ? this.paypal
        : this.gateway;

    const session =
      await gateway.createCheckout({
        amount: invoice.amount,
        currency: invoice.currency,
        description: `Invoice ${invoice.number}`,
        invoiceId: invoice.id,
        successUrl,
        cancelUrl,
      });

    const record: PaymentRecord = {
      id: randomUUID(),
      invoiceId: invoice.id,
      clientId: invoice.clientId,
      provider,
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
   * Captures a PayPal order when the payer returns, and marks the
   * invoice paid on success.
   */
  async capturePayPalReturn(
    orderId: string,
  ): Promise<CaptureOutcome> {
    const result =
      await this.paypal.captureOrder(
        orderId,
      );

    if (!result.completed) {
      return { completed: false };
    }

    const payment =
      this.repository.findBySession(
        orderId,
      );

    const invoiceId =
      result.invoiceId ??
      payment?.invoiceId;

    if (invoiceId) {
      this.markPaid(
        invoiceId,
        orderId,
      );
    }

    return {
      completed: true,
      invoiceId,
    };
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
    const stripe =
      this.gateway.isConnected();

    const paypal =
      this.paypal.isConnected();

    const connected =
      stripe || paypal;

    return {
      connected,
      stripe,
      paypal,
      message: connected
        ? "Payments are connected. You can collect on invoices."
        : "Connect Stripe or PayPal to collect payments on invoices.",
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
