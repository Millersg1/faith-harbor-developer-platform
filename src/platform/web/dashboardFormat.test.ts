import { describe, expect, it } from "vitest";

import {
  accentInk,
  actorLabel,
  displayName,
  greetingFor,
  planPriceText,
  progressPercent,
  relativeLuminance,
  renewalText,
  safeAccent,
} from "./dashboardFormat";

describe("progressPercent", () => {
  it("computes 2 of 6 as 33 (~33.33%)", () => {
    expect(progressPercent(2, 6)).toBe(33);
  });

  it("is 0 for zero total (no divide-by-zero)", () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(3, 0)).toBe(0);
  });

  it("clamps and reaches 100 when all done", () => {
    expect(progressPercent(6, 6)).toBe(100);
    expect(progressPercent(9, 6)).toBe(100);
  });
});

describe("displayName", () => {
  it("prefers the name when present", () => {
    expect(displayName("Shawn Miller", "x@y.com")).toBe("Shawn Miller");
  });

  it("humanizes the email local-part when no name", () => {
    expect(displayName(undefined, "shawn@faithharbor.com")).toBe("Shawn");
    expect(displayName("", "  ")).toBe("");
  });
});

describe("greetingFor", () => {
  it("uses the time of day and the name", () => {
    expect(greetingFor("Shawn", undefined, 9)).toBe("Good morning, Shawn");
    expect(greetingFor("Shawn", undefined, 14)).toBe("Good afternoon, Shawn");
    expect(greetingFor("Shawn", undefined, 20)).toBe("Good evening, Shawn");
  });

  it("falls back to email, then to a bare greeting", () => {
    expect(greetingFor(undefined, "sam@x.com", 9)).toBe("Good morning, Sam");
    expect(greetingFor(undefined, "", 9)).toBe("Good morning");
  });
});

describe("planPriceText", () => {
  it("formats a priced plan", () => {
    expect(planPriceText(9900, "month")).toBe("$99/month");
    expect(planPriceText(0, "month")).toBe("$0/month");
  });

  it("shows custom pricing for null cents (Enterprise)", () => {
    expect(planPriceText(null, "month")).toBe("Custom pricing");
  });
});

describe("renewalText", () => {
  it("never invents a date when none is available", () => {
    expect(renewalText(null)).toBe("No renewal date scheduled");
    expect(renewalText("not-a-date")).toBe("No renewal date scheduled");
  });

  it("formats a real renewal date", () => {
    expect(renewalText("2026-09-01T00:00:00.000Z")).toBe("Renews 2026-09-01");
  });
});

describe("tenant accent validation", () => {
  it("keeps a valid brand hex, rejects malformed input", () => {
    expect(safeAccent("#6d28d9", "#2dd4bf")).toBe("#6d28d9");
    expect(safeAccent("red; }body{}", "#2dd4bf")).toBe("#2dd4bf");
    expect(safeAccent(undefined, "#2dd4bf")).toBe("#2dd4bf");
  });

  it("chooses readable ink: dark on light accents, white on dark accents", () => {
    // Light teal → dark ink.
    expect(accentInk("#2dd4bf")).toBe("#06231f");
    // Dark navy brand → white ink (never invisible).
    expect(accentInk("#1a2540")).toBe("#ffffff");
    // Malformed → safe dark ink default.
    expect(accentInk("nope")).toBe("#06231f");
  });

  it("computes relative luminance (0..1), -1 for malformed", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("bad")).toBe(-1);
  });
});

describe("actorLabel", () => {
  it("uses the actor name when present", () => {
    expect(actorLabel("user", "Alex")).toBe("Alex");
  });

  it("falls back by actor type", () => {
    expect(actorLabel("system", undefined)).toBe("System");
    expect(actorLabel("ai", undefined)).toBe("AI assistant");
    expect(actorLabel("portal", undefined)).toBe("Client");
    expect(actorLabel("user", undefined)).toBe("A teammate");
  });
});
