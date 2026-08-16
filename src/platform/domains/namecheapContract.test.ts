/**
 * OPT-IN Namecheap SANDBOX contract test. It is skipped unless BOTH:
 *   RUN_NAMECHEAP_SANDBOX_CONTRACT=1
 *   AND all NAMECHEAP_SANDBOX_* credentials are present in the environment.
 *
 * It NEVER runs by default (so CI and local `npm test` are safe), NEVER uses
 * production credentials, and does ONLY read-only calls (availability + a
 * pricing lookup). No registration, payment, DNS, or mutation of any kind.
 *
 *   RUN_NAMECHEAP_SANDBOX_CONTRACT=1 \
 *   NAMECHEAP_SANDBOX_API_USER=... NAMECHEAP_SANDBOX_USERNAME=... \
 *   NAMECHEAP_SANDBOX_API_KEY=... NAMECHEAP_SANDBOX_CLIENT_IP=... \
 *   npx vitest run src/platform/domains/namecheapContract.test.ts
 */
import { describe, expect, it } from "vitest";

import { createRegistrarProvider } from "./registrarFactory";
import { NamecheapRegistrarProvider } from "./NamecheapRegistrarProvider";

const hasCreds = Boolean(
  process.env.NAMECHEAP_SANDBOX_API_USER &&
    process.env.NAMECHEAP_SANDBOX_USERNAME &&
    process.env.NAMECHEAP_SANDBOX_API_KEY &&
    process.env.NAMECHEAP_SANDBOX_CLIENT_IP,
);
const RUN = process.env.RUN_NAMECHEAP_SANDBOX_CONTRACT === "1" && hasCreds;

describe.runIf(RUN)("Namecheap sandbox contract (read-only)", () => {
  const provider = createRegistrarProvider({
    DOMAIN_REGISTRAR_MODE: "namecheap_sandbox",
    NAMECHEAP_SANDBOX_API_USER: process.env.NAMECHEAP_SANDBOX_API_USER,
    NAMECHEAP_SANDBOX_USERNAME: process.env.NAMECHEAP_SANDBOX_USERNAME,
    NAMECHEAP_SANDBOX_API_KEY: process.env.NAMECHEAP_SANDBOX_API_KEY,
    NAMECHEAP_SANDBOX_CLIENT_IP: process.env.NAMECHEAP_SANDBOX_CLIENT_IP,
  });

  it("is a real Namecheap sandbox provider", () => {
    expect(provider).toBeInstanceOf(NamecheapRegistrarProvider);
    expect(provider.mode).toBe("namecheap_sandbox");
  });

  it("returns availability for a well-known domain (read-only)", async () => {
    const [google] = await provider.checkAvailability(["google.com"]);
    expect(google.domain).toBe("google.com");
    expect(google.available).toBe(false); // taken
  }, 30_000);

  it("returns a .com register price (read-only)", async () => {
    const price = await provider.getRegisterPrice("com", 1);
    expect(price.cost.amountMinor).toBeGreaterThan(0);
    expect(price.cost.currency).toBe("USD");
  }, 30_000);
});
