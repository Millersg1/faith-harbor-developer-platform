import type { InvoiceRecord } from "../accounting/InvoiceRecord";
import type { ClientRecord } from "../clients/ClientTypes";
import type { ProjectRecord } from "../projects/ProjectRecord";
import type { LeadRecord } from "../sales/LeadRecord";

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
 * A read-only source of leads for the scanner.
 */
export interface LeadSource {
  list(): readonly LeadRecord[];
}

/**
 * A read-only source of projects for the scanner.
 */
export interface ProjectSource {
  list(): readonly ProjectRecord[];
}

/**
 * Optional extra sources and thresholds for the scanner.
 */
export interface ScannerOptions {
  leads?: LeadSource;
  projects?: ProjectSource;

  /**
   * Days without an update before an open lead is "quiet".
   */
  leadQuietDays?: number;

  /**
   * Days without an update before an active project has "stalled".
   */
  projectStalledDays?: number;
}

/**
 * Lead stages still worth a follow-up (not yet won or lost).
 */
const OPEN_LEAD_STATUSES =
  new Set([
    "new",
    "contacted",
    "qualified",
    "proposal",
  ]);

/**
 * Project stages still in flight (not finished or archived).
 */
const ACTIVE_PROJECT_STATUSES =
  new Set([
    "planned",
    "active",
  ]);

const MS_PER_DAY =
  24 * 60 * 60 * 1000;

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
  private readonly leadQuietDays: number;

  private readonly projectStalledDays: number;

  constructor(
    private readonly invoices: InvoiceSource,
    private readonly clients: ClientSource,
    private readonly automation: AutomationService,
    private readonly options: ScannerOptions = {},
  ) {
    this.leadQuietDays =
      options.leadQuietDays ?? 7;

    this.projectStalledDays =
      options.projectStalledDays ??
      14;
  }

  /**
   * Runs one scan and returns how many new drafts were prepared.
   *
   * `now` is injectable so tests stay deterministic.
   */
  run(now: Date = new Date()): number {
    return (
      this.scanOverdueInvoices(now) +
      this.scanQuietLeads(now) +
      this.scanStalledProjects(now)
    );
  }

  /**
   * Drafts payment reminders for sent, unpaid, past-due invoices.
   */
  private scanOverdueInvoices(
    now: Date,
  ): number {
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
   * Drafts follow-ups for open leads that have gone quiet.
   */
  private scanQuietLeads(
    now: Date,
  ): number {
    const leads =
      this.options.leads;

    if (!leads) {
      return 0;
    }

    const cutoff =
      this.cutoffIso(
        now,
        this.leadQuietDays,
      );

    let created = 0;

    for (
      const lead of leads.list()
    ) {
      if (
        !OPEN_LEAD_STATUSES.has(
          lead.status,
        )
      ) {
        continue;
      }

      if (
        lead.updatedAt >= cutoff
      ) {
        continue;
      }

      const draft =
        this.automation.onLeadQuiet(
          lead,
        );

      if (draft) {
        created += 1;
      }
    }

    return created;
  }

  /**
   * Drafts check-ins for active projects that have stalled.
   */
  private scanStalledProjects(
    now: Date,
  ): number {
    const projects =
      this.options.projects;

    if (!projects) {
      return 0;
    }

    const cutoff =
      this.cutoffIso(
        now,
        this.projectStalledDays,
      );

    let created = 0;

    for (
      const project of projects.list()
    ) {
      if (
        !ACTIVE_PROJECT_STATUSES.has(
          project.status,
        )
      ) {
        continue;
      }

      if (
        project.updatedAt >= cutoff
      ) {
        continue;
      }

      let client: ClientRecord;

      try {
        client =
          this.clients.get(
            project.clientId,
          );
      } catch {
        continue;
      }

      const draft =
        this.automation.onProjectStalled(
          project,
          client,
        );

      if (draft) {
        created += 1;
      }
    }

    return created;
  }

  /**
   * Returns the ISO timestamp `days` before `now`. Records updated
   * before this are considered quiet or stalled.
   */
  private cutoffIso(
    now: Date,
    days: number,
  ): string {
    return new Date(
      now.getTime() -
        days * MS_PER_DAY,
    ).toISOString();
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
