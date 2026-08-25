/**
 * Stage 12A Step 4 — ONE-SHOT NameSilo OTE registrar-lock verification.
 *
 * Proves the registrar transfer-lock capability end to end on an already-
 * registered OTE domain WITHOUT leaving it exposed: read the fresh lock baseline,
 * and ONLY when it is clearly locked, perform exactly one unlock (reconciled
 * read-only) then exactly one relock (reconciled read-only), restoring the domain
 * to its locked baseline. It touches NOTHING else — no DNS, nameservers, contacts,
 * privacy, auto-renew, renewal, transfer, auth-code, payment, refund, email, or
 * production.
 *
 * Safety:
 *  - fail closed unless the baseline is CLEARLY locked=true (registered domain,
 *    provider-reported lock true) — otherwise zero mutation;
 *  - each mutation is guarded by a SEPARATE single-use authorization (distinct
 *    unlock/relock acks) consumed BEFORE the call, and is NEVER auto-retried;
 *  - an ambiguous / transport outcome is treated as UNKNOWN and reconciled with
 *    read-only reads only;
 *  - if the final state cannot be confirmed locked=true it is `needs_attention`
 *    and the audit prominently flags that the domain MAY remain unlocked.
 *
 * The module logs nothing; it returns a SANITIZED audit (enums, the exact domain,
 * boolean lock states, outcome enums, attempt counts, timestamps, and a provider
 * ref hash / `reference_absent`).
 */

import { createHash } from "node:crypto";

import type { DomainRegistrarProvider, RegistrarOutcome } from "../RegistrarProvider";
import { OneShotAuthorization } from "./oteRegisterOnce";

export const UNLOCK_ONE_OTE_ACK = "UNLOCK_ONE_OTE_DOMAIN_LOCK";
export const LOCK_ONE_OTE_ACK = "LOCK_ONE_OTE_DOMAIN_LOCK";

type Tri = boolean | "unknown";
type OutcomeOrNa = RegistrarOutcome | "not_attempted";

const refOrAbsent = (ref?: string): string => (ref && ref.trim() ? createHash("sha256").update(ref).digest("hex").slice(0, 12) : "reference_absent");

export type LockClassification =
  | "restored_locked"      // full cycle proven, domain back to locked baseline
  | "baseline_not_locked"  // baseline not clearly locked ⇒ zero mutation
  | "rejected"             // a mutation was definitively refused
  | "transport_unknown"    // a mutation's acceptance was never established
  | "needs_attention";     // inconclusive / may be unlocked

export interface LockAudit {
  operation: "registrar_lock_verify";
  domain: string;
  baselineLocked: Tri;
  afterUnlock: Tri | "not_attempted";
  finalLocked: Tri;
  unlockOutcome: OutcomeOrNa;
  relockOutcome: OutcomeOrNa;
  attempts: { unlock: number; relock: number };
  classification: LockClassification;
  /** Prominent flag: the domain may currently be UNLOCKED and needs attention. */
  mayRemainUnlocked: boolean;
  providerRefHashUnlock: string;
  providerRefHashRelock: string;
  startedAt: string;
  endedAt: string;
}

export interface LockOneShotDeps {
  registrar: DomainRegistrarProvider;
  now: () => string;
  newId: () => string;
}

export interface LockVerifyRequest {
  domain: string;
  unlockAuth: OneShotAuthorization; // armed UNLOCK_ONE_OTE_ACK
  relockAuth: OneShotAuthorization; // armed LOCK_ONE_OTE_ACK
  unlockAck: string;
  relockAck: string;
}

/** Read-only lock state: true/false when clearly reported, else "unknown". */
async function readLock(registrar: DomainRegistrarProvider, domain: string): Promise<Tri> {
  try {
    const st = await registrar.getRegistrationStatus(domain);
    if (!st.registered) return "unknown";
    return st.locked === true ? true : st.locked === false ? false : "unknown";
  } catch {
    return "unknown";
  }
}

export async function verifyRegistrarLockOnce(deps: LockOneShotDeps, req: LockVerifyRequest): Promise<LockAudit> {
  const startedAt = deps.now();
  const base: LockAudit = {
    operation: "registrar_lock_verify", domain: req.domain,
    baselineLocked: "unknown", afterUnlock: "not_attempted", finalLocked: "unknown",
    unlockOutcome: "not_attempted", relockOutcome: "not_attempted",
    attempts: { unlock: 0, relock: 0 }, classification: "baseline_not_locked", mayRemainUnlocked: false,
    providerRefHashUnlock: "not_attempted", providerRefHashRelock: "not_attempted", startedAt, endedAt: startedAt,
  };
  const done = (a: Partial<LockAudit>): LockAudit => ({ ...base, ...a, endedAt: deps.now() });

  // ---- Baseline (read-only). Fail closed unless clearly locked=true. ----
  const baseline = await readLock(deps.registrar, req.domain);
  if (baseline !== true) {
    return done({ baselineLocked: baseline, finalLocked: baseline, classification: "baseline_not_locked", mayRemainUnlocked: false });
  }

  // ---- Exactly one UNLOCK (separate single-use auth, consumed before call) ----
  req.unlockAuth.consume(req.unlockAck);
  const unlock = await deps.registrar.setRegistrarLock(req.domain, false, deps.newId());
  // Reconcile read-only regardless of the outcome (rejection included) to learn
  // the domain's actual lock state. NEVER retry the unlock.
  const afterUnlock = await readLock(deps.registrar, req.domain);
  const unlockRef = refOrAbsent(unlock.providerCorrelationId);

  if (afterUnlock !== false) {
    // Unlock not confirmed. NEVER retry. Domain is (as far as we can tell) still
    // locked or unknown. If it is still locked=true → baseline preserved (safe);
    // otherwise flag it.
    const cls: LockClassification = unlock.outcome === "provider_rejection" ? "rejected" : unlock.outcome === "transport_failure_pre_acceptance" ? "transport_unknown" : "needs_attention";
    return done({
      baselineLocked: true, afterUnlock, finalLocked: afterUnlock, unlockOutcome: unlock.outcome,
      attempts: { unlock: 1, relock: 0 }, classification: afterUnlock === true ? cls : "needs_attention",
      mayRemainUnlocked: afterUnlock !== true, providerRefHashUnlock: unlockRef,
    });
  }

  // ---- Clearly unlocked → exactly one RELOCK (separate single-use auth) ----
  req.relockAuth.consume(req.relockAck);
  const relock = await deps.registrar.setRegistrarLock(req.domain, true, deps.newId());
  const finalLocked = await readLock(deps.registrar, req.domain);
  const relockRef = refOrAbsent(relock.providerCorrelationId);

  // Domain SAFETY governs the classification: restored ⇒ success; anything else
  // (rejection, transport, ambiguous, or a read that isn't clearly locked) ⇒
  // needs_attention with the prominent may-remain-unlocked flag. The specific
  // provider outcome is retained in relockOutcome for the audit.
  const restored = finalLocked === true;
  return done({
    baselineLocked: true, afterUnlock: false, finalLocked, unlockOutcome: unlock.outcome, relockOutcome: relock.outcome,
    attempts: { unlock: 1, relock: 1 },
    classification: restored ? "restored_locked" : "needs_attention",
    mayRemainUnlocked: !restored, // PROMINENT: domain may remain unlocked
    providerRefHashUnlock: unlockRef, providerRefHashRelock: relockRef,
  });
}
