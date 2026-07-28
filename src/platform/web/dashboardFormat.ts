/**
 * Pure, dependency-free formatting helpers for the dashboard.
 *
 * These are unit-tested here AND embedded verbatim into the client script in
 * `pages.ts` (via `Function.prototype.toString()`), so the browser runs exactly
 * the code these tests cover — no drift between tested logic and shipped logic.
 * Keep every function self-contained (no imports, no module-scope references
 * except the sibling helpers listed in DASHBOARD_FORMAT_FNS).
 */

/** Progress as an integer 0–100. Safe for zero/negative/oversize totals. */
export function progressPercent(completed: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }
  const done = Math.max(0, Math.min(completed, total));
  return Math.round((done / total) * 100);
}

/** A human display name: the name if set, else a humanized email local-part. */
export function displayName(name?: string, email?: string): string {
  const trimmed = (name || "").trim();
  if (trimmed) {
    return trimmed;
  }
  const mail = (email || "").trim();
  const at = mail.indexOf("@");
  if (at > 0) {
    const local = mail.slice(0, at);
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return "";
}

/** A time-of-day greeting, personalized when a name/email is available. */
export function greetingFor(
  name: string | undefined,
  email: string | undefined,
  hour: number,
): string {
  const part =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const who = displayName(name, email);
  return who ? part + ", " + who : part;
}

/** Plan price text; null cents means custom pricing. */
export function planPriceText(
  priceCents: number | null,
  interval: string,
): string {
  if (priceCents === null || priceCents === undefined) {
    return "Custom pricing";
  }
  const dollars = (priceCents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return "$" + dollars + "/" + (interval || "month");
}

/** Renewal text; null/invalid dates never invent a date. */
export function renewalText(currentPeriodEnd: string | null): string {
  if (!currentPeriodEnd) {
    return "No renewal date scheduled";
  }
  const t = Date.parse(currentPeriodEnd);
  if (Number.isNaN(t)) {
    return "No renewal date scheduled";
  }
  return "Renews " + new Date(t).toISOString().slice(0, 10);
}

/** Actor label for an activity row; falls back by actor type. */
export function actorLabel(
  actorType: string | undefined,
  actorName: string | undefined,
): string {
  const named = (actorName || "").trim();
  if (named) {
    return named;
  }
  if (actorType === "system") {
    return "System";
  }
  if (actorType === "ai") {
    return "AI assistant";
  }
  if (actorType === "portal") {
    return "Client";
  }
  return "A teammate";
}

/** Relative luminance (WCAG) of a #rrggbb color; -1 if malformed. */
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-fA-F]{6})$/.exec((hex || "").trim());
  if (!m) {
    return -1;
  }
  const int = parseInt(m[1], 16);
  const chan = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

/**
 * A validated accent color: the tenant's `#rrggbb` if well-formed, else the
 * platform fallback. Rejects malformed input so CSS can never receive a value
 * that breaks the theme.
 */
export function safeAccent(hex: string | undefined, fallback: string): string {
  const h = (hex || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(h) ? h : fallback;
}

/**
 * The readable text ("ink") color to place on an accent background — dark ink
 * on a light accent, white on a dark accent — so branded buttons and the active
 * tab are always legible whatever brand color the tenant chooses.
 */
export function accentInk(hex: string): string {
  const l = relativeLuminance(hex);
  if (l < 0) {
    return "#06231f";
  }
  return l > 0.42 ? "#06231f" : "#ffffff";
}

/**
 * The helpers embedded into the client script, in dependency order
 * (displayName before greetingFor, relativeLuminance before accentInk).
 * pages.ts stringifies these.
 */
export const DASHBOARD_FORMAT_FNS = [
  progressPercent,
  displayName,
  greetingFor,
  planPriceText,
  renewalText,
  actorLabel,
  relativeLuminance,
  safeAccent,
  accentInk,
] as const;
