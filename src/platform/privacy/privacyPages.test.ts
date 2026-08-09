import { describe, expect, it } from "vitest";

import { privacyIntakePage } from "./privacyPages";

const html = privacyIntakePage({
  brandName: "All Elite Cloud",
  destinationLabel: "platform",
});

describe("privacyIntakePage — client script", () => {
  it("reads field values through a safe accessor, never bare `name.value`", () => {
    // `name` collides with the native `window.name` string, so a bare
    // `name.value.trim()` throws in a real browser and the form never submits.
    // Regression guard for that (caught only in-browser, not by API tests).
    expect(html).not.toMatch(/[^.]\bname\.value/);
    expect(html).toContain("document.getElementById(id).value");
    expect(html).toContain("val('name')");
  });

  it("submits to the intake endpoint and requires the acknowledgement", () => {
    expect(html).toContain("fetch('/privacy-requests'");
    expect(html).toMatch(/getElementById\('ack'\)\.checked/);
  });
});
