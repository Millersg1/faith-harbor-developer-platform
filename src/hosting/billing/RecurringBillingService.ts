import type { BrandService } from "../../brands/BrandService";
import type { InvoiceRecord } from "../../accounting/InvoiceRecord";
import type { InvoiceService } from "../../accounting/InvoiceService";
import type { EmailService } from "../../communications/EmailService";
import type { HostingAccountService } from "../HostingAccountService";
import type { HostingPlanService } from "../plans/HostingPlanService";
import type { HostingOrderRepository } from "../orders/HostingOrderRepository";
import type { HostingOrderRecord } from "../orders/HostingOrderTypes";
import type { ProvisioningService } from "../provisioning/ProvisioningService";
import {
  addBillingPeriod,
  daysBetween,
} from "./billingPeriod";

interface Brand {
  name: string;
  fromEmail?: string;
}

interface BillingLogger {
  error: (
    message: string,
    error: unknown,
  ) => void;
  info?: (message: string) => void;
}

export interface RecurringBillingOptions {
  /**
   * Days before a term ends to raise the renewal invoice + first notice.
   */
  renewalLeadDays?: number;

  /**
   * Days a renewal invoice may stay unpaid past due before the account
   * is suspended.
   */
  graceDays?: number;

  /**
   * Master switch for automatic suspension. When false, the engine still
   * invoices and reminds but never suspends.
   */
  autoSuspend?: boolean;

  /**
   * Public app URL, used to link customers to the portal to pay.
   */
  appUrl?: string;

  brands?: BrandService;

  logger?: BillingLogger;

  /**
   * Clock injection for tests. Defaults to the real clock.
   */
  now?: () => Date;
}

/**
 * The recurring-billing engine for hosting.
 *
 * On each cycle it: (1) raises a renewal invoice a few days before a
 * term ends and emails the customer, (2) sends escalating reminders while
 * that invoice is unpaid, and (3) once past the grace period, suspends the
 * account (reversible — the data is preserved). When a renewal invoice is
 * paid, {@link handleRenewalPayment} advances the term and reactivates a
 * suspended account automatically.
 *
 * Account TERMINATION is never automated — an unpaid account is suspended
 * and left for a human to cancel. Suspension is always reversible.
 */
export class RecurringBillingService {
  private readonly renewalLeadDays: number;

  private readonly graceDays: number;

  private readonly autoSuspend: boolean;

  private readonly appUrl?: string;

  private readonly brands?: BrandService;

  private readonly logger: BillingLogger;

  private readonly now: () => Date;

  constructor(
    private readonly orders: HostingOrderRepository,
    private readonly plans: HostingPlanService,
    private readonly invoices: InvoiceService,
    private readonly provisioning: ProvisioningService,
    private readonly hostingAccounts: HostingAccountService,
    private readonly emails: EmailService,
    options: RecurringBillingOptions = {},
  ) {
    this.renewalLeadDays =
      options.renewalLeadDays ?? 7;
    this.graceDays =
      options.graceDays ?? 7;
    this.autoSuspend =
      options.autoSuspend ?? true;
    this.appUrl = options.appUrl;
    this.brands = options.brands;
    this.logger =
      options.logger ?? {
        error: (message, error) =>
          console.error(
            message,
            error,
          ),
      };
    this.now =
      options.now ?? (() => new Date());
  }

  /**
   * Runs one billing cycle across every auto-renewing order. Returns the
   * number of actions taken (invoices raised, reminders sent, accounts
   * suspended) so the scheduler can log activity.
   */
  async runBillingCycle(): Promise<number> {
    const now = this.now();
    let actions = 0;

    for (const order of this.orders.list()) {
      if (!this.isRenewable(order)) {
        continue;
      }

      try {
        actions +=
          await this.processOrder(
            order,
            now,
          );
      } catch (error) {
        this.logger.error(
          `Recurring billing failed for order ${order.id}.`,
          error,
        );
      }
    }

    return actions;
  }

  /**
   * Handles a paid renewal invoice: advances the term, clears reminder
   * state, and reactivates the account if it had been suspended. Returns
   * true when the invoice belonged to a renewal (so callers know it was
   * handled). Safe to call for any invoice id.
   */
  async handleRenewalPayment(
    invoiceId: string,
  ): Promise<boolean> {
    const order =
      this.orders.findByRenewalInvoiceId(
        invoiceId,
      );

    if (!order) {
      return false;
    }

    const nowIso =
      this.now().toISOString();

    const base =
      order.nextDueDate ?? nowIso;

    this.orders.update({
      ...order,
      nextDueDate: addBillingPeriod(
        base,
        order.billingCycle,
      ),
      lastRenewedAt: nowIso,
      renewalInvoiceId: undefined,
      lastReminderStage: 0,
      updatedAt: nowIso,
    });

    let reactivated = false;

    if (order.username) {
      const account =
        this.hostingAccounts.findByUsername(
          order.username,
        );

      if (
        account &&
        account.status ===
          "suspended" &&
        this.provisioning.isAvailable()
      ) {
        try {
          await this.provisioning.unsuspend(
            account,
          );
          reactivated = true;
        } catch (error) {
          this.logger.error(
            `Failed to reactivate ${order.username} after renewal payment.`,
            error,
          );
        }
      }
    }

    await this.sendRenewalConfirmation(
      order,
      reactivated,
    );

    return true;
  }

  private isRenewable(
    order: HostingOrderRecord,
  ): boolean {
    return (
      order.status === "provisioned" &&
      order.autoRenew !== false &&
      Boolean(order.nextDueDate) &&
      Boolean(order.username)
    );
  }

  private async processOrder(
    order: HostingOrderRecord,
    now: Date,
  ): Promise<number> {
    const account = order.username
      ? this.hostingAccounts.findByUsername(
          order.username,
        )
      : undefined;

    // A cancelled account is off the billing treadmill entirely.
    if (
      account &&
      account.status === "cancelled"
    ) {
      return 0;
    }

    const dueDate = new Date(
      order.nextDueDate as string,
    );

    // Phase 1: raise the renewal invoice once the term is within the
    // lead window and none is outstanding yet.
    if (!order.renewalInvoiceId) {
      const daysUntilDue = daysBetween(
        now,
        dueDate,
      );

      if (
        daysUntilDue <=
        this.renewalLeadDays
      ) {
        return this.raiseRenewalInvoice(
          order,
        );
      }

      return 0;
    }

    // Phase 2: an invoice is outstanding — remind, then suspend.
    return this.chaseRenewalInvoice(
      order,
      account,
      dueDate,
      now,
    );
  }

  private raiseRenewalInvoice(
    order: HostingOrderRecord,
  ): number {
    const plan = this.plans.get(
      order.planId,
    );

    // The plan was removed from the catalog — cannot price a renewal,
    // so leave the order untouched for a human to resolve.
    if (!plan) {
      this.logger.error(
        `Cannot renew order ${order.id}: plan ${order.planId} no longer exists.`,
        undefined,
      );

      return 0;
    }

    const priceCents =
      order.billingCycle === "yearly"
        ? plan.priceYearlyCents
        : plan.priceMonthlyCents;

    const invoice =
      this.invoices.create({
        clientId: order.clientId,
        status: "sent",
        dueDate: order.nextDueDate,
        lineItems: [
          {
            description: `${plan.name} hosting renewal (${order.billingCycle}) — ${order.domain}`,
            quantity: 1,
            unitPrice: priceCents / 100,
          },
        ],
        metadata: {
          hostingOrderId: order.id,
          kind: "hosting-renewal",
        },
      });

    const nowIso =
      this.now().toISOString();

    this.orders.update({
      ...order,
      renewalInvoiceId: invoice.id,
      lastReminderStage: 1,
      updatedAt: nowIso,
    });

    void this.sendRenewalNotice(
      order,
      invoice,
      "upcoming",
    );

    return 1;
  }

  private async chaseRenewalInvoice(
    order: HostingOrderRecord,
    account:
      | ReturnType<
          HostingAccountService["findByUsername"]
        >
      | undefined,
    dueDate: Date,
    now: Date,
  ): Promise<number> {
    const invoice = this.tryGetInvoice(
      order.renewalInvoiceId as string,
    );

    // The invoice vanished (deleted) — drop the link so a fresh one can
    // be raised next cycle.
    if (!invoice) {
      this.orders.update({
        ...order,
        renewalInvoiceId: undefined,
        lastReminderStage: 0,
        updatedAt:
          this.now().toISOString(),
      });

      return 0;
    }

    // Payment is handled by handleRenewalPayment; if we still see it
    // paid here, there's nothing to chase.
    if (invoice.status === "paid") {
      return 0;
    }

    const daysPastDue = daysBetween(
      dueDate,
      now,
    );

    let actions = 0;

    // Escalating reminders, de-duplicated by stage.
    const stage =
      this.reminderStage(daysPastDue);
    const lastStage =
      order.lastReminderStage ?? 0;

    if (stage > lastStage) {
      void this.sendRenewalNotice(
        order,
        invoice,
        stage >= 3
          ? "final"
          : "overdue",
      );

      this.orders.update({
        ...order,
        lastReminderStage: stage,
        updatedAt:
          this.now().toISOString(),
      });

      actions += 1;
    }

    // Suspend once past the grace period.
    if (
      this.autoSuspend &&
      daysPastDue >= this.graceDays &&
      account &&
      account.status === "active" &&
      this.provisioning.isAvailable()
    ) {
      try {
        await this.provisioning.suspend(
          account,
          `Non-payment of renewal invoice ${invoice.number}`,
        );

        void this.sendSuspensionNotice(
          order,
          invoice,
        );

        actions += 1;
      } catch (error) {
        this.logger.error(
          `Failed to suspend ${order.username} for non-payment.`,
          error,
        );
      }
    }

    return actions;
  }

  /**
   * Maps days-past-due to a reminder stage:
   * 1 upcoming (before due), 2 overdue (on/after due),
   * 3 final notice (approaching suspension).
   */
  private reminderStage(
    daysPastDue: number,
  ): number {
    if (
      daysPastDue >=
      this.graceDays - 1
    ) {
      return 3;
    }

    if (daysPastDue >= 0) {
      return 2;
    }

    return 1;
  }

  private tryGetInvoice(
    invoiceId: string,
  ): InvoiceRecord | undefined {
    try {
      return this.invoices.get(
        invoiceId,
      );
    } catch {
      return undefined;
    }
  }

  private resolveBrand(
    brandId: string | undefined,
  ): Brand | undefined {
    if (!brandId || !this.brands) {
      return undefined;
    }

    try {
      return this.brands.get(brandId);
    } catch {
      return undefined;
    }
  }

  private payHint(): string {
    return this.appUrl
      ? `Sign in to your client portal to pay: ${this.appUrl}/portal`
      : "Sign in to your client portal to pay.";
  }

  private async sendRenewalNotice(
    order: HostingOrderRecord,
    invoice: InvoiceRecord,
    stage: "upcoming" | "overdue" | "final",
  ): Promise<void> {
    const brand = this.resolveBrand(
      order.brandId,
    );
    const brandName =
      brand?.name ?? "Faith Harbor";
    const amount =
      invoice.amount.toFixed(2);

    const heading =
      stage === "upcoming"
        ? `Your ${brandName} hosting for ${order.domain} renews soon`
        : stage === "overdue"
          ? `Payment due: ${brandName} hosting for ${order.domain}`
          : `Final notice: ${brandName} hosting for ${order.domain}`;

    const lead =
      stage === "upcoming"
        ? `Your hosting term is coming up for renewal. We've prepared invoice ${invoice.number} for ${invoice.currency} ${amount}.`
        : stage === "overdue"
          ? `Invoice ${invoice.number} for ${invoice.currency} ${amount} is now due. Please pay it to keep your website online.`
          : `Invoice ${invoice.number} for ${invoice.currency} ${amount} is past due. To avoid your website being suspended, please pay as soon as possible.`;

    const body = [
      heading,
      "",
      lead,
      "",
      this.payHint(),
      "",
      "Thank you for hosting with us.",
      brandName,
    ].join("\n");

    await this.safeSend(
      order.contactEmail,
      heading,
      body,
      brand?.fromEmail,
      order.clientId,
    );
  }

  private async sendSuspensionNotice(
    order: HostingOrderRecord,
    invoice: InvoiceRecord,
  ): Promise<void> {
    const brand = this.resolveBrand(
      order.brandId,
    );
    const brandName =
      brand?.name ?? "Faith Harbor";

    const subject = `Your ${brandName} hosting for ${order.domain} has been suspended`;

    const body = [
      subject,
      "",
      `Because renewal invoice ${invoice.number} remains unpaid, your hosting account has been suspended and your website is temporarily offline.`,
      "",
      "Your data is safe. As soon as the invoice is paid, your account is reactivated automatically.",
      "",
      this.payHint(),
      "",
      brandName,
    ].join("\n");

    await this.safeSend(
      order.contactEmail,
      subject,
      body,
      brand?.fromEmail,
      order.clientId,
    );
  }

  private async sendRenewalConfirmation(
    order: HostingOrderRecord,
    reactivated: boolean,
  ): Promise<void> {
    const brand = this.resolveBrand(
      order.brandId,
    );
    const brandName =
      brand?.name ?? "Faith Harbor";

    const subject = reactivated
      ? `Your ${brandName} hosting for ${order.domain} is back online`
      : `Thanks — your ${brandName} hosting for ${order.domain} is renewed`;

    const body = [
      subject,
      "",
      reactivated
        ? "We received your payment and reactivated your account. Your website is back online."
        : "We received your renewal payment. Your hosting continues without interruption.",
      "",
      "Thank you for hosting with us.",
      brandName,
    ].join("\n");

    await this.safeSend(
      order.contactEmail,
      subject,
      body,
      brand?.fromEmail,
      order.clientId,
    );
  }

  /**
   * Sends an email but never lets a delivery failure break the billing
   * cycle — billing state has already been persisted by the caller.
   */
  private async safeSend(
    to: string,
    subject: string,
    body: string,
    from: string | undefined,
    clientId: string | undefined,
  ): Promise<void> {
    try {
      await this.emails.send({
        to,
        subject,
        body,
        from,
        clientId,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send billing email "${subject}" to ${to}.`,
        error,
      );
    }
  }
}
