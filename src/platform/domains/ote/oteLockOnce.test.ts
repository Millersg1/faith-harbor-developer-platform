import { describe, expect, it } from "vitest";

import type { DomainRegistrarProvider, DomainStatus, RegistrarMutationResult, RegistrarOutcome } from "../RegistrarProvider";
import { OneShotAuthorization } from "./oteRegisterOnce";
import {
  LOCK_ONE_OTE_ACK,
  UNLOCK_ONE_OTE_ACK,
  verifyRegistrarLockOnce,
} from "./oteLockOnce";

const DOMAIN = "aec-ote-x.com";

/**
 * Stateful stub: models the real lock flow — a successful unlock/relock flips the
 * reported lock state; a rejected/failed/ambiguous/transport mutation does not.
 * Counts each setRegistrarLock(locked) call.
 */
function stub(opts: {
  baselineLocked?: boolean | undefined; // undefined => omitted lock field (unknown)
  registered?: boolean;
  throwOnStatus?: boolean;
  unlockOutcome?: RegistrarOutcome;
  relockOutcome?: RegistrarOutcome;
  unlockEffect?: boolean; // does the unlock actually change the state (default: from outcome)
  relockEffect?: boolean;
} = {}) {
  let locked = opts.baselineLocked;
  const calls = { unlock: 0, relock: 0, status: 0 };
  const applied = (o?: RegistrarOutcome) => o === undefined || o === "definitive_success";
  const reg: Partial<DomainRegistrarProvider> = {
    async getRegistrationStatus(): Promise<DomainStatus> {
      calls.status++;
      if (opts.throwOnStatus) throw new Error("status timeout");
      const st: DomainStatus = { domain: DOMAIN, registered: opts.registered ?? true };
      if (locked !== undefined) st.locked = locked;
      return st;
    },
    async setRegistrarLock(_d: string, wantLocked: boolean): Promise<RegistrarMutationResult> {
      if (wantLocked) {
        calls.relock++;
        const o = opts.relockOutcome ?? "definitive_success";
        if (opts.relockEffect ?? applied(opts.relockOutcome)) locked = true;
        return { outcome: o, applied: applied(o) };
      }
      calls.unlock++;
      const o = opts.unlockOutcome ?? "definitive_success";
      if (opts.unlockEffect ?? applied(opts.unlockOutcome)) locked = false;
      return { outcome: o, applied: applied(o) };
    },
  };
  return { registrar: reg as DomainRegistrarProvider, calls };
}

const deps = (registrar: DomainRegistrarProvider) => ({ registrar, now: () => "2026-08-25T00:00:00Z", newId: () => "idem" });
const req = (over: Record<string, unknown> = {}) => ({
  domain: DOMAIN,
  unlockAuth: new OneShotAuthorization(UNLOCK_ONE_OTE_ACK),
  relockAuth: new OneShotAuthorization(LOCK_ONE_OTE_ACK),
  unlockAck: UNLOCK_ONE_OTE_ACK,
  relockAck: LOCK_ONE_OTE_ACK,
  ...over,
});

describe("Step 4 — registrar-lock verify: baseline fail-closed", () => {
  it.each([
    ["unlocked baseline", { baselineLocked: false }],
    ["unknown (omitted lock field)", { baselineLocked: undefined }],
    ["not registered", { registered: false }],
  ])("%s ⇒ zero mutation", async (_n, o) => {
    const { registrar, calls } = stub(o);
    const a = await verifyRegistrarLockOnce(deps(registrar), req());
    expect(a.classification).toBe("baseline_not_locked");
    expect(calls.unlock + calls.relock).toBe(0);
    expect(a.mayRemainUnlocked).toBe(false);
  });
  it("a baseline read error ⇒ unknown ⇒ zero mutation", async () => {
    const { registrar, calls } = stub({ throwOnStatus: true });
    const a = await verifyRegistrarLockOnce(deps(registrar), req());
    expect(a.classification).toBe("baseline_not_locked");
    expect(a.baselineLocked).toBe("unknown");
    expect(calls.unlock + calls.relock).toBe(0);
  });
});

describe("Step 4 — registrar-lock verify: happy path", () => {
  it("locked baseline ⇒ one unlock + one relock, restored to locked", async () => {
    const { registrar, calls } = stub({ baselineLocked: true });
    const a = await verifyRegistrarLockOnce(deps(registrar), req());
    expect(a.classification).toBe("restored_locked");
    expect(a.baselineLocked).toBe(true);
    expect(a.afterUnlock).toBe(false);
    expect(a.finalLocked).toBe(true);
    expect(a.attempts).toEqual({ unlock: 1, relock: 1 }); // EXACTLY one each
    expect(a.mayRemainUnlocked).toBe(false);
    expect(calls.unlock).toBe(1);
    expect(calls.relock).toBe(1);
  });
  it("sanitized audit carries booleans/enums/hashes only (no secrets)", async () => {
    const { registrar } = stub({ baselineLocked: true });
    const a = await verifyRegistrarLockOnce(deps(registrar), req());
    expect(a.operation).toBe("registrar_lock_verify");
    // No provider ref on a bare lock reply ⇒ reference_absent (honest).
    expect(a.providerRefHashUnlock).toBe("reference_absent");
    expect(JSON.stringify(a)).not.toMatch(/key=|whsec_|<reply>|http/i);
  });
});

describe("Step 4 — one-shot authorization binding", () => {
  it("reused unlock authorization throws; no second unlock", async () => {
    const { registrar, calls } = stub({ baselineLocked: true });
    const auth = new OneShotAuthorization(UNLOCK_ONE_OTE_ACK);
    await verifyRegistrarLockOnce(deps(registrar), req({ unlockAuth: auth }));
    // Reuse the SAME unlock auth on a fresh locked domain.
    const s2 = stub({ baselineLocked: true });
    await expect(verifyRegistrarLockOnce(deps(s2.registrar), req({ unlockAuth: auth }))).rejects.toMatchObject({ code: "already_consumed" });
    expect(s2.calls.unlock).toBe(0);
    void calls;
  });
  it("wrong unlock ack ⇒ bad_acknowledgment, zero mutation", async () => {
    const { registrar, calls } = stub({ baselineLocked: true });
    await expect(verifyRegistrarLockOnce(deps(registrar), req({ unlockAck: "nope" }))).rejects.toMatchObject({ code: "bad_acknowledgment" });
    expect(calls.unlock).toBe(0);
  });
  it("an unlock-bound token cannot authorize the relock (distinct operation acks)", async () => {
    const { registrar } = stub({ baselineLocked: true });
    // relockAuth armed with the UNLOCK ack ⇒ relock consume (LOCK ack) fails.
    await expect(verifyRegistrarLockOnce(deps(registrar), req({ relockAuth: new OneShotAuthorization(UNLOCK_ONE_OTE_ACK) })))
      .rejects.toMatchObject({ code: "bad_acknowledgment" });
  });
});

describe("Step 4 — ambiguous / transport / failure handling (never blind-retry)", () => {
  it("unlock rejected but domain stays locked ⇒ rejected, baseline preserved, exactly one unlock, no relock", async () => {
    const { registrar, calls } = stub({ baselineLocked: true, unlockOutcome: "provider_rejection" });
    const a = await verifyRegistrarLockOnce(deps(registrar), req());
    expect(a.classification).toBe("rejected");
    expect(a.finalLocked).toBe(true); // still locked
    expect(a.mayRemainUnlocked).toBe(false);
    expect(calls.unlock).toBe(1);
    expect(calls.relock).toBe(0);
  });
  it("ambiguous unlock that DID take effect ⇒ reconciles to unlocked, proceeds to relock, restores", async () => {
    const { registrar, calls } = stub({ baselineLocked: true, unlockOutcome: "ambiguous_unknown", unlockEffect: true });
    const a = await verifyRegistrarLockOnce(deps(registrar), req());
    expect(a.afterUnlock).toBe(false);
    expect(a.classification).toBe("restored_locked");
    expect(calls.unlock).toBe(1); // never repeated despite ambiguity
  });
  it("ambiguous unlock with NO effect ⇒ still locked ⇒ needs_attention, no relock, no retry", async () => {
    const { registrar, calls } = stub({ baselineLocked: true, unlockOutcome: "ambiguous_unknown", unlockEffect: false });
    const a = await verifyRegistrarLockOnce(deps(registrar), req());
    expect(a.classification).toBe("needs_attention");
    expect(a.finalLocked).toBe(true); // safe: still locked
    expect(calls.unlock).toBe(1);
    expect(calls.relock).toBe(0);
  });
  it("relock FAILS after a real unlock ⇒ needs_attention + PROMINENT mayRemainUnlocked, no retry", async () => {
    const { registrar, calls } = stub({ baselineLocked: true, relockOutcome: "provider_rejection" });
    const a = await verifyRegistrarLockOnce(deps(registrar), req());
    expect(a.classification).toBe("needs_attention");
    expect(a.finalLocked).toBe(false);
    expect(a.mayRemainUnlocked).toBe(true); // domain left UNLOCKED — flagged
    expect(calls.unlock).toBe(1);
    expect(calls.relock).toBe(1); // exactly one, not repeated
  });
  it("ambiguous relock that DID restore ⇒ restored_locked (never repeated)", async () => {
    const { registrar, calls } = stub({ baselineLocked: true, relockOutcome: "ambiguous_unknown", relockEffect: true });
    const a = await verifyRegistrarLockOnce(deps(registrar), req());
    expect(a.classification).toBe("restored_locked");
    expect(a.finalLocked).toBe(true);
    expect(calls.relock).toBe(1);
  });
  it("transport-unknown relock that did NOT restore ⇒ needs_attention + mayRemainUnlocked", async () => {
    const { registrar } = stub({ baselineLocked: true, relockOutcome: "transport_failure_pre_acceptance", relockEffect: false });
    const a = await verifyRegistrarLockOnce(deps(registrar), req());
    expect(a.classification).toBe("needs_attention");
    expect(a.mayRemainUnlocked).toBe(true);
  });
});
