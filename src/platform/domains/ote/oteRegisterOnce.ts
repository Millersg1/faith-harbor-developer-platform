/**
 * Stage 12A Step 2 — ONE-SHOT NameSilo OTE registration orchestrator.
 *
 * A single, tightly-bounded registrar mutation for controlled OTE acceptance:
 * exactly one `register`, exactly one `.com`, one year, no retry, no Stripe
 * gateway, no refund worker, and NO other registrar operation. The one-shot
 * authorization is CONSUMED before the provider call, so a second attempt — or
 * any retry — fails closed. This module performs no I/O beyond the injected
 * registrar's read (availability, status) and the single `register`.
 *
 * It logs nothing itself; the caller records only sanitized evidence. Contact
 * values are passed straight through to the provider and are never returned in
 * the sanitized result.
 */

import { createHash } from "node:crypto";

import type {
  DomainRegistrarProvider,
  RegisterInput,
  RegistrarOutcome,
} from "../RegistrarProvider";

/** The exact acknowledgment string the operator must supply. */
export const REGISTER_ONE_OTE_ACK = "REGISTER_ONE_OTE_DOMAIN";

export class OneShotGuardError extends Error {
  constructor(readonly code: string) {
    super(`One-shot OTE register guard: ${code}.`);
    this.name = "OneShotGuardError";
  }
}

/**
 * A single-use authorization. `consume` succeeds exactly once and only with the
 * exact acknowledgment; every later call (a retry or a second run) throws.
 */
export class OneShotAuthorization {
  private consumed = false;
  constructor(private readonly armedAck: string) {}

  consume(providedAck: string): void {
    if (this.consumed) throw new OneShotGuardError("already_consumed");
    if (!this.armedAck) throw new OneShotGuardError("authorization_not_armed");
    if (providedAck !== this.armedAck) throw new OneShotGuardError("bad_acknowledgment");
    this.consumed = true;
  }

  get isConsumed(): boolean {
    return this.consumed;
  }
}

export interface OteRegisterRequest {
  /** Must be a `.com` domain. */
  domain: string;
  /** Must be exactly 1. */
  years: number;
  contacts: RegisterInput["contacts"];
  /** Must equal REGISTER_ONE_OTE_ACK. */
  acknowledgment: string;
  /** Registration WHOIS privacy. Defaults to false (kept simple for acceptance). */
  enablePrivacy?: boolean;
}

export type OteRegisterClassification =
  | "registered"
  | "failed"
  | "rejected"
  | "transport_unknown"
  | "needs_attention";

export interface OteReconciliation {
  registered: boolean;
  expiresAt?: string;
  nameservers?: string[];
  locked?: boolean;
  privacyEnabled?: boolean;
  autoRenew?: boolean;
  lifecycleState?: string;
}

export interface OteRegisterOutcome {
  outcome: RegistrarOutcome;
  classification: OteRegisterClassification;
  retry: false;
  attempts: 1;
  /** sha256(providerCorrelationId), first 12 hex chars — never the raw id. */
  providerRefHash?: string;
  reconciliation?: OteReconciliation;
}

export interface OteRegisterDeps {
  registrar: DomainRegistrarProvider;
  auth: OneShotAuthorization;
  newId: () => string;
}

function hashRef(ref?: string): string | undefined {
  if (!ref) return undefined;
  return createHash("sha256").update(ref).digest("hex").slice(0, 12);
}

function classify(outcome: RegistrarOutcome): OteRegisterClassification {
  switch (outcome) {
    case "definitive_success":
      return "registered";
    case "definitive_failure":
      return "failed";
    case "provider_rejection":
      return "rejected";
    case "transport_failure_pre_acceptance":
      return "transport_unknown";
    case "ambiguous_unknown":
      return "needs_attention";
  }
}

/**
 * Runs the single guarded registration. Read-only reconciliation follows a
 * success (to confirm state) and an ambiguous outcome (to resolve it without
 * ever resubmitting; inconclusive stays needs_attention).
 */
export async function registerOneOteDomain(deps: OteRegisterDeps, req: OteRegisterRequest): Promise<OteRegisterOutcome> {
  // Structural guards BEFORE anything else — fail closed, no auth consumed.
  if (!/^[a-z0-9-]+\.com$/i.test(req.domain)) throw new OneShotGuardError("tld_not_com");
  if (req.years !== 1) throw new OneShotGuardError("term_not_one_year");

  // Confirm availability + reject premium IMMEDIATELY before submission.
  const avail = await deps.registrar.checkAvailability([req.domain]);
  const hit = avail.find((a) => a.domain.toLowerCase() === req.domain.toLowerCase());
  if (!hit || !hit.available) throw new OneShotGuardError("not_available");
  if (hit.isPremium) throw new OneShotGuardError("premium_rejected");

  // Consume the single-use authorization. From here a retry/second run throws.
  deps.auth.consume(req.acknowledgment);

  // EXACTLY ONE register. No Stripe, no payment id, auto-renew stays OFF (the
  // adapter fixes auto_renew=0); one year.
  const input: RegisterInput = {
    domain: req.domain,
    years: 1,
    contacts: req.contacts,
    enablePrivacy: req.enablePrivacy ?? false,
    premiumAcknowledged: false,
    idempotencyKey: deps.newId(),
  };
  const result = await deps.registrar.register(input);
  const classification = classify(result.outcome);
  const providerRefHash = hashRef(result.providerCorrelationId);

  // Read-only reconciliation for success + ambiguous. NEVER a second register.
  let reconciliation: OteReconciliation | undefined;
  let finalClassification = classification;
  if (result.outcome === "definitive_success" || result.outcome === "ambiguous_unknown") {
    try {
      const st = await deps.registrar.getRegistrationStatus(req.domain);
      reconciliation = {
        registered: Boolean(st.registered),
        expiresAt: st.expiresAt,
        nameservers: st.nameservers,
        locked: st.locked,
        privacyEnabled: st.privacyEnabled,
        autoRenew: st.autoRenew,
        lifecycleState: st.lifecycleState,
      };
      if (result.outcome === "ambiguous_unknown") {
        // Resolve ONLY to registered if the provider now positively confirms it;
        // otherwise leave needs_attention (never assume success).
        finalClassification = st.registered ? "registered" : "needs_attention";
      }
    } catch {
      // Reconciliation read failed — do not resubmit. A success stays registered
      // (the register call already confirmed it); an ambiguous stays needs_attention.
      if (result.outcome === "ambiguous_unknown") finalClassification = "needs_attention";
    }
  }

  return { outcome: result.outcome, classification: finalClassification, retry: false, attempts: 1, providerRefHash, reconciliation };
}
