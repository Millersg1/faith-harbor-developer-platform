import { describe, expect, it } from "vitest";

import {
  PrivacyRequestService,
  PrivacyStateError,
  PrivacyValidationError,
  type Scope,
} from "./PrivacyRequestService";
import { PrivacyRequestRepository } from "./PrivacyRequestRepository";

const TENANT_A: Scope = { kind: "tenant", organizationId: "org-a" };
const TENANT_B: Scope = { kind: "tenant", organizationId: "org-b" };
const PLATFORM: Scope = { kind: "platform" };

function svc(repo = new PrivacyRequestRepository()) {
  return new PrivacyRequestService(repo);
}

const base = {
  category: "deletion",
  name: "Dana Doe",
  email: "  Dana@Example.COM ",
  description: "Please delete my data.",
};

describe("PrivacyRequestService — intake & validation", () => {
  it("creates a tenant request with normalized email and hidden token", async () => {
    const s = svc();
    const { record, verifyToken } = await s.create({
      ...base,
      destination: "tenant",
      organizationId: "org-a",
    });
    expect(record.email).toBe("dana@example.com");
    expect(record.destination).toBe("tenant");
    expect(record.organizationId).toBe("org-a");
    expect(record.status).toBe("pending_verification");
    expect(record.verificationState).toBe("unverified");
    expect(verifyToken).toHaveLength(64); // 32 bytes hex
    // The record carries no raw token fields.
    expect(JSON.stringify(record)).not.toContain(verifyToken);
  });

  it("creates a platform request with null organization", async () => {
    const s = svc();
    const { record } = await s.create({
      ...base,
      destination: "platform",
      organizationId: null,
    });
    expect(record.destination).toBe("platform");
    expect(record.organizationId).toBeNull();
  });

  it("fails closed: tenant destination requires an organization id", async () => {
    const s = svc();
    await expect(
      s.create({ ...base, destination: "tenant", organizationId: null }),
    ).rejects.toBeInstanceOf(PrivacyValidationError);
  });

  it("rejects an invalid email, bad category, or empty description", async () => {
    const s = svc();
    await expect(
      s.create({ ...base, email: "nope", destination: "platform", organizationId: null }),
    ).rejects.toBeInstanceOf(PrivacyValidationError);
    await expect(
      s.create({ ...base, category: "hack", destination: "platform", organizationId: null }),
    ).rejects.toBeInstanceOf(PrivacyValidationError);
    await expect(
      s.create({ ...base, description: "   ", destination: "platform", organizationId: null }),
    ).rejects.toBeInstanceOf(PrivacyValidationError);
  });
});

describe("PrivacyRequestService — verification (single-use, hashed)", () => {
  it("verifies, advances to received, mints a status token, and is single-use", async () => {
    const s = svc();
    const { record, verifyToken } = await s.create({
      ...base,
      destination: "tenant",
      organizationId: "org-a",
    });
    const v = await s.verifyEmail(verifyToken);
    expect("record" in v).toBe(true);
    if (!("record" in v)) return;
    expect(v.record.status).toBe("received");
    expect(v.record.verificationState).toBe("email_verified");
    expect(v.statusToken).toHaveLength(64);
    expect(v.statusToken).not.toBe(verifyToken);
    // Replay is refused (token cleared / already used).
    const again = await s.verifyEmail(verifyToken);
    expect("error" in again).toBe(true);
    expect(record.id).toBeTruthy();
  });

  it("rejects invalid and expired tokens safely", async () => {
    const s = svc();
    expect(await s.verifyEmail("deadbeef")).toEqual({ error: "invalid" });
    expect(await s.verifyEmail("")).toEqual({ error: "invalid" });
  });

  it("requester status is redacted (no internal notes)", async () => {
    const s = svc();
    const { verifyToken } = await s.create({
      ...base,
      destination: "tenant",
      organizationId: "org-a",
    });
    const v = await s.verifyEmail(verifyToken);
    if (!("record" in v)) throw new Error("verify failed");
    const id = v.record.id;
    await s.addNote(TENANT_A, id, { body: "SECRET internal note", visibility: "internal" });
    await s.addNote(TENANT_A, id, { body: "We received your request.", visibility: "requester" });

    const view = await s.requesterStatus(v.statusToken);
    expect(view).toBeTruthy();
    expect(view?.status).toBe("received");
    expect(view?.messages.map((m) => m.body)).toEqual([
      "We received your request.",
    ]);
    expect(JSON.stringify(view)).not.toContain("SECRET internal note");
    // A wrong/guessed token yields nothing.
    expect(await s.requesterStatus("0".repeat(64))).toBeUndefined();
  });
});

describe("PrivacyRequestService — lifecycle & authorization scope", () => {
  async function received(s: PrivacyRequestService, scope: Scope) {
    const { verifyToken } = await s.create({
      ...base,
      destination: scope.kind,
      organizationId: scope.kind === "tenant" ? scope.organizationId : null,
    });
    const v = await s.verifyEmail(verifyToken);
    if (!("record" in v)) throw new Error("verify failed");
    return v.record.id;
  }

  it("enforces the transition state machine and substantive-decision reason", async () => {
    const s = svc();
    const id = await received(s, TENANT_A);
    // received -> fulfilled is NOT allowed directly.
    await expect(
      s.transition(TENANT_A, id, "fulfilled", { resolutionSummary: "x" }),
    ).rejects.toBeInstanceOf(PrivacyStateError);
    // received -> in_review OK.
    await s.transition(TENANT_A, id, "in_review");
    // in_review -> fulfilled requires a written explanation.
    await expect(
      s.transition(TENANT_A, id, "fulfilled"),
    ).rejects.toBeInstanceOf(PrivacyStateError);
    const done = await s.transition(TENANT_A, id, "fulfilled", {
      resolutionSummary: "Deleted per policy.",
    });
    expect(done.status).toBe("fulfilled");
    expect(done.completedAt).toBeTruthy();
    // Idempotent no-op.
    const same = await s.transition(TENANT_A, id, "fulfilled");
    expect(same.status).toBe("fulfilled");
  });

  it("isolates tenants and separates platform from tenant", async () => {
    const s = svc();
    const aId = await received(s, TENANT_A);
    // Tenant B cannot see or mutate Tenant A's request.
    await expect(s.get(TENANT_B, aId)).rejects.toBeTruthy();
    await expect(
      s.transition(TENANT_B, aId, "in_review"),
    ).rejects.toBeTruthy();
    expect(await s.list(TENANT_B)).toHaveLength(0);
    // Platform scope cannot see a tenant request either.
    await expect(s.get(PLATFORM, aId)).rejects.toBeTruthy();

    const pId = await received(s, PLATFORM);
    // A tenant cannot see the platform request.
    await expect(s.get(TENANT_A, pId)).rejects.toBeTruthy();
    expect((await s.list(PLATFORM)).map((r) => r.id)).toContain(pId);
    expect((await s.list(TENANT_A)).map((r) => r.id)).not.toContain(pId);
  });
});
