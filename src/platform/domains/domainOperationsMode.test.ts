import { describe, expect, it } from "vitest";

import {
  describeDomainOperationsMode,
  mutationAllowed,
  resolveDomainOperationsMode,
} from "./domainOperationsMode";

describe("Stage 11 — domain operations mode (fail closed)", () => {
  it("missing/empty resolves to disabled", () => {
    expect(resolveDomainOperationsMode(undefined).mode).toBe("disabled");
    expect(resolveDomainOperationsMode("").mode).toBe("disabled");
    expect(resolveDomainOperationsMode("   ").mode).toBe("disabled");
    expect(resolveDomainOperationsMode(undefined).source).toBe("unset_failed_closed");
  });
  it("unrecognized resolves to disabled (fail closed)", () => {
    const r = resolveDomainOperationsMode("enabled");
    expect(r.mode).toBe("disabled");
    expect(r.source).toBe("invalid_failed_closed");
    expect(r.raw).toBe("enabled");
  });
  it("recognized modes select their path (case-insensitive)", () => {
    expect(resolveDomainOperationsMode("reconcile_only").mode).toBe("reconcile_only");
    expect(resolveDomainOperationsMode("FULL").mode).toBe("full");
    expect(resolveDomainOperationsMode("disabled").mode).toBe("disabled");
  });
  it("mutation is allowed ONLY in full mode", () => {
    expect(mutationAllowed("full")).toBe(true);
    expect(mutationAllowed("reconcile_only")).toBe(false);
    expect(mutationAllowed("disabled")).toBe(false);
  });
  it("describe is a secret-free banner that flags fail-closed states", () => {
    expect(describeDomainOperationsMode(resolveDomainOperationsMode(undefined))).toContain("FAILED CLOSED");
    expect(describeDomainOperationsMode(resolveDomainOperationsMode("full"))).toBe("domain operations mode = full");
  });
});
