/**
 * Assembles the tenant dashboard summary — real, tenant-scoped metric counts
 * plus a billing summary — from injected getters. Kept free of concrete
 * dependencies so it is trivially testable; the server wires the getters over
 * the ambiently tenant-scoped services.
 *
 * A metric whose getter is not provided (module not wired for the tenant) is
 * reported as `null` — an honest "unavailable", never a misleading zero. A
 * getter that throws is also reported as `null` rather than crashing the page.
 */

export type DashboardMetricKey =
  | "clients"
  | "leads"
  | "activeProjects"
  | "openTickets"
  | "websites"
  | "campaigns"
  | "aiEmployees";

export type DashboardMetrics = Record<DashboardMetricKey, number | null>;

export interface DashboardBillingSummary {
  planId: string;
  planName: string;
  status: string;
  /** Integer cents/month, or null for custom (Enterprise) pricing. */
  priceCents: number | null;
  interval: string;
  /** ISO renewal date, or null when none is available (e.g. no Stripe). */
  currentPeriodEnd: string | null;
  limits: Record<string, number | null>;
}

export interface DashboardSummary {
  metrics: DashboardMetrics;
  billing: DashboardBillingSummary | null;
}

const METRIC_KEYS: readonly DashboardMetricKey[] = [
  "clients",
  "leads",
  "activeProjects",
  "openTickets",
  "websites",
  "campaigns",
  "aiEmployees",
];

export interface DashboardInputs {
  /** Per-metric count getters; omit one to report that metric as unavailable. */
  counts: Partial<Record<DashboardMetricKey, () => Promise<number>>>;
  /** Billing summary getter; omit when billing is not wired. */
  billing?: () => Promise<DashboardBillingSummary>;
}

export class DashboardService {
  constructor(private readonly inputs: DashboardInputs) {}

  async summary(): Promise<DashboardSummary> {
    const entries = await Promise.all(
      METRIC_KEYS.map(async (key) => {
        const getter = this.inputs.counts[key];
        if (!getter) {
          return [key, null] as const;
        }
        try {
          const value = await getter();
          return [key, Number.isFinite(value) ? value : null] as const;
        } catch {
          return [key, null] as const;
        }
      }),
    );

    const metrics = Object.fromEntries(entries) as DashboardMetrics;

    let billing: DashboardBillingSummary | null = null;
    if (this.inputs.billing) {
      try {
        billing = await this.inputs.billing();
      } catch {
        billing = null;
      }
    }

    return { metrics, billing };
  }
}
