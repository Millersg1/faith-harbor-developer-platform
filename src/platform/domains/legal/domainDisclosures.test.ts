import { describe, expect, it } from "vitest";

import { LegalMarkerError, PlatformLegalService } from "../../legal/PlatformLegalService";
import { DOMAIN_REGISTRATION_TERMS_SEED } from "./domainRegistrationTerms";

describe("Stage 11 — domain legal disclosures stay UNPUBLISHED (guard)", () => {
  it("the draft covers all required disclosures with review markers", () => {
    const body = DOMAIN_REGISTRATION_TERMS_SEED.bodyMarkdown;
    expect(DOMAIN_REGISTRATION_TERMS_SEED.publish).toBe(false);
    // Required Stage-11 disclosure topics are present.
    for (const topic of [
      "Accurate registrant", // registrant-accuracy
      "refund", // refund
      "Automatic renewal authorization", // auto-renewal
      "DNS and nameserver", // DNS
      "Transfers away", // transfer-away
      "renewal", "transfer", "registration",
    ]) {
      expect(body.toLowerCase()).toContain(topic.toLowerCase());
    }
    // Carries at least one publish-blocking review marker.
    expect(body).toContain("LEGAL REVIEW REQUIRED");
  });

  it("the server-side publish guard REFUSES to publish it while markers remain", async () => {
    const legal = new PlatformLegalService();
    const draft = await legal.createDraft({
      kind: "domain-registration",
      title: DOMAIN_REGISTRATION_TERMS_SEED.title,
      summary: DOMAIN_REGISTRATION_TERMS_SEED.summary,
      bodyMarkdown: DOMAIN_REGISTRATION_TERMS_SEED.bodyMarkdown,
    });
    await expect(legal.publish(draft.id)).rejects.toBeInstanceOf(LegalMarkerError);
    // It never became the published version.
    expect(await legal.getPublished("domain-registration")).toBeUndefined();
  });

  it("does not touch other legal kinds' published documents", async () => {
    const legal = new PlatformLegalService();
    // No domain-registration publish occurred; unrelated kinds remain untouched.
    expect(await legal.getPublished("terms")).toBeUndefined();
    expect(await legal.getPublished("privacy")).toBeUndefined();
  });
});
