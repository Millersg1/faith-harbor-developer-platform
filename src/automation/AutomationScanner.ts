import type { InvoiceRecord } from "../accounting/InvoiceRecord";
import type { ClientRecord } from "../clients/ClientTypes";

import type { AutomationService } from "./AutomationService";

/**
 * A read-only source of invoices for the scanner.
 */
export interface InvoiceSource {
  list(): readonly InvoiceRecord[];
}

/**
 * A read-only source of clients for the scanner.
 *
 * get() throws when the client does not exist, matching the client
 * service; the scanner treats a missing client as a skip.
 */
export interface ClientSource {
  get(id: string): ClientRecord;
}

/**
 * Looks over the business for time-based work that needs attention
 * and asks the automation engine to prepare drafts for it.
 *
 * This is the periodic side of automation. Where the event hooks
 * react the instant something happens, the scanner catches things
 * that become true with the passage of time — today, invoices that
 * have slipped past their due date.
 *
 * It only prepares drafts; nothing is sent. The engine's dedup keeps
 * repeated scans from drafting more than one reminder per invoice.
 */
export class AutomationScanner {
  constructor(
    private readonly invoices: InvoiceSource,
    private readonly clients: ClientSource,
    private readonly automation: AutomationService,
  ) {}

  /**
   * Runs one scan and returns how many new drafts were prepared.
   *
   * `now` is injectable so tests stay deterministic.
   */
  run(now: Date = new Date()): number {
    const today =
      now
        .toISOString()
        .slice(0, 10);

    let created = 0;

    for (
      const invoice of this.invoices.list()
    ) {
      if (
        !this.isOverdue(
          invoice,
          today,
        )
      ) {
        continue;
      }

      let client: ClientRecord;

      try {
        client =
          this.clients.get(
            invoice.clientId,
          );
      } catch {
        // The client record is gone; nothing to remind.
        continue;
      }

      const draft =
        this.automation.onInvoiceOverdue(
          invoice,
          client,
        );

      if (draft) {
        created += 1;
      }
    }

    return created;
  }

  /**
   * An invoice is overdue when it has been issued, is not paid, and
   * its due date is strictly before today.
   */
  private isOverdue(
    invoice: InvoiceRecord,
    today: string,
  ): boolean {
    if (invoice.paidDate) {
      return false;
    }

    if (
      invoice.status !== "sent" &&
      invoice.status !== "overdue"
    ) {
      return false;
    }

    if (!invoice.dueDate) {
      return false;
    }

    return (
      invoice.dueDate.slice(0, 10) <
      today
    );
  }
}
