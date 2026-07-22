import type { HostingBillingCycle } from "../orders/HostingOrderTypes";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Advances an ISO date by one billing period (one month or one year).
 *
 * Month arithmetic clamps to the end of the shorter month so a term that
 * starts on the 31st renews on the last day of a 30-day month rather than
 * skipping into the following month.
 */
export function addBillingPeriod(
  iso: string,
  cycle: HostingBillingCycle,
): string {
  const date = new Date(iso);

  if (cycle === "yearly") {
    date.setUTCFullYear(
      date.getUTCFullYear() + 1,
    );

    return date.toISOString();
  }

  const day = date.getUTCDate();

  // Move to the first of the month before shifting, so adding a month
  // never rolls over a short month, then clamp the day back.
  date.setUTCDate(1);
  date.setUTCMonth(
    date.getUTCMonth() + 1,
  );

  const daysInMonth = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();

  date.setUTCDate(
    Math.min(day, daysInMonth),
  );

  return date.toISOString();
}

/**
 * Whole days between two instants (later minus earlier), rounded down.
 * Negative when `later` precedes `earlier`.
 */
export function daysBetween(
  earlier: Date,
  later: Date,
): number {
  return Math.floor(
    (later.getTime() -
      earlier.getTime()) /
      DAY_MS,
  );
}
