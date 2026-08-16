import { describe, expect, it } from "vitest";

import {
  attr,
  classifyTransportError,
  decimalToMinor,
  elements,
  extractApiError,
  isApiError,
  NamecheapParseError,
  redactSecrets,
  sanitizeText,
} from "./namecheapXml";

describe("decimalToMinor (no float money)", () => {
  it.each([
    ["10.98", 1098],
    ["12", 1200],
    ["0.1", 10],
    ["0.09", 9],
    ["9.999", 1000], // 3dp rounds half-up into cents
    ["9.994", 999],
  ])("%s -> %d", (s, expected) => {
    expect(decimalToMinor(s)).toBe(expected);
  });
  it("rejects junk", () => {
    expect(() => decimalToMinor("nope")).toThrow(NamecheapParseError);
    expect(() => decimalToMinor("-1")).toThrow();
    expect(() => decimalToMinor("1e3")).toThrow();
  });
});

describe("redactSecrets", () => {
  it("redacts the whole Namecheap query string", () => {
    const url =
      "https://api.sandbox.namecheap.com/xml.response?ApiUser=bob&ApiKey=SECRET123&Command=namecheap.domains.check&DomainList=a.com";
    const out = redactSecrets(url);
    expect(out).not.toContain("SECRET123");
    expect(out).not.toContain("bob");
    expect(out).toContain("[REDACTED]");
  });
  it("redacts individual sensitive params anywhere", () => {
    const out = redactSecrets("boom ApiKey=abc ClientIp=1.2.3.4 UserName=joe");
    expect(out).not.toContain("abc");
    expect(out).not.toContain("joe");
    expect(out).toContain("ApiKey=[REDACTED]");
  });
});

describe("attribute + element extraction", () => {
  const xml =
    '<ApiResponse Status="OK"><CommandResponse>' +
    '<DomainCheckResult Domain="a.com" Available="true" IsPremiumName="false"/>' +
    '<DomainCheckResult Domain="b.com" Available="false" IsPremiumName="true" PremiumRegistrationPrice="4200.00"/>' +
    "</CommandResponse></ApiResponse>";
  it("reads attributes", () => {
    const els = elements(xml, "DomainCheckResult");
    expect(els).toHaveLength(2);
    expect(attr(els[0], "Domain")).toBe("a.com");
    expect(attr(els[1], "IsPremiumName")).toBe("true");
    expect(attr(els[1], "PremiumRegistrationPrice")).toBe("4200.00");
  });
  it("bounds oversized bodies", () => {
    expect(() => elements("x".repeat(2_000_001), "X")).toThrow();
  });
});

describe("API error envelope", () => {
  const err =
    '<ApiResponse Status="ERROR"><Errors>' +
    '<Error Number="2019166">Domain not found</Error>' +
    "</Errors></ApiResponse>";
  it("detects + extracts a sanitized error", () => {
    expect(isApiError(err)).toBe(true);
    const e = extractApiError(err);
    expect(e.number).toBe("2019166");
    expect(e.message).toBe("Domain not found");
  });
});

describe("sanitizeText", () => {
  it("strips newlines + non-printables + bounds length", () => {
    expect(sanitizeText("a\nb\tc")).toBe("a b c");
    expect(sanitizeText("x".repeat(500)).length).toBe(200);
  });
});

describe("classifyTransportError", () => {
  it("pre-acceptance for DNS/refused/TLS", () => {
    expect(classifyTransportError({ code: "ENOTFOUND" })).toBe(
      "transport_failure_pre_acceptance",
    );
    expect(classifyTransportError({ code: "ECONNREFUSED" })).toBe(
      "transport_failure_pre_acceptance",
    );
    expect(
      classifyTransportError(new Error("self signed certificate")),
    ).toBe("transport_failure_pre_acceptance");
  });
  it("ambiguous for reset/timeout/unknown", () => {
    expect(classifyTransportError({ code: "ECONNRESET" })).toBe(
      "ambiguous_unknown",
    );
    expect(classifyTransportError({ code: "ETIMEDOUT" })).toBe(
      "ambiguous_unknown",
    );
    expect(classifyTransportError(new Error("weird"))).toBe(
      "ambiguous_unknown",
    );
  });
});
