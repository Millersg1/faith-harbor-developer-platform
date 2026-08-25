import { describe, expect, it } from "vitest";

import {
  classifyTransportError,
  decimalToMinor,
  envelopeStatus,
  extractApiError,
  findAll,
  findFirst,
  NamecheapParseError,
  parseNamecheap,
  redactSecrets,
  sanitizeText,
} from "./namecheapXml";

const NS = 'xmlns="http://api.namecheap.com/xml.response"';

describe("decimalToMinor (no float money)", () => {
  it.each([
    ["10.98", 1098],
    ["12", 1200],
    ["0.1", 10],
    ["0.09", 9],
    ["9.999", 1000],
    ["9.994", 999],
    // Thousands-grouped amounts (NameSilo OTE getAccountBalance format).
    ["10,000.00", 1000000],
    ["1,234.56", 123456],
    ["9,999,999.99", 999999999],
    ["1,000", 100000],
    ["1,234.5", 123450],
  ])("%s -> %d", (s, expected) => {
    expect(decimalToMinor(s)).toBe(expected);
  });
  it("rejects junk", () => {
    expect(() => decimalToMinor("nope")).toThrow(NamecheapParseError);
    expect(() => decimalToMinor("-1")).toThrow();
    expect(() => decimalToMinor("1e3")).toThrow();
  });
  it("honors commas ONLY as strict 3-digit group separators (fails closed otherwise)", () => {
    for (const bad of ["1,2,3", "1,23.45", "12,34.5", "1,0000.00", ",100", "100,", "$1,000.00", "1 000.00", "1,00,000"]) {
      expect(() => decimalToMinor(bad), bad).toThrow(NamecheapParseError);
    }
  });
  it("never echoes the offending value in the error message", () => {
    expect(() => decimalToMinor("SECRET1,2,3VALUE")).toThrow(/^Invalid money value\.$/);
  });
});

describe("redactSecrets", () => {
  it("redacts the whole Namecheap query string + EPP code", () => {
    const url =
      "https://api.sandbox.namecheap.com/xml.response?ApiUser=bob&ApiKey=SECRET&Command=x&EPPCode=ZZZ";
    const out = redactSecrets(url);
    expect(out).not.toContain("SECRET");
    expect(out).not.toContain("bob");
    expect(out).toContain("[REDACTED]");
  });
  it("redacts individual params anywhere", () => {
    const out = redactSecrets("ApiKey=abc ClientIp=1.2.3.4 EPPCode=xyz");
    expect(out).not.toContain("abc");
    expect(out).not.toContain("xyz");
  });
});

describe("parseNamecheap — authentic fixtures", () => {
  it("parses a success envelope + namespace, reads by local name", () => {
    const root = parseNamecheap(
      `<?xml version="1.0" encoding="utf-8"?><ApiResponse ${NS} Status="OK">` +
        "<Errors /><CommandResponse>" +
        '<DomainCheckResult Domain="a.com" Available="true" IsPremiumName="false"/>' +
        "</CommandResponse></ApiResponse>",
    );
    expect(root.name).toBe("ApiResponse");
    expect(envelopeStatus(root)).toBe("OK");
    const d = findFirst(root, "DomainCheckResult")!;
    expect(d.attrs.get("Domain")).toBe("a.com");
    expect(d.attrs.get("Available")).toBe("true");
  });

  it("strips a namespace prefix on element + attribute names", () => {
    const root = parseNamecheap(
      `<ApiResponse ${NS} Status="OK"><nc:DomainCheckResult Domain="a.com"/></ApiResponse>`,
    );
    expect(findAll(root, "DomainCheckResult")).toHaveLength(1);
  });

  it("decodes escaped text and attribute values", () => {
    const root = parseNamecheap(
      `<ApiResponse Status="ERROR"><Errors>` +
        `<Error Number="1">A &amp; B &lt; C</Error></Errors></ApiResponse>`,
    );
    expect(extractApiError(root).message).toBe("A & B < C");
  });

  it("captures MULTIPLE provider errors", () => {
    const root = parseNamecheap(
      `<ApiResponse Status="ERROR"><Errors>` +
        `<Error Number="2019166">Domain not found</Error>` +
        `<Error Number="4022336">Insufficient balance</Error>` +
        `</Errors></ApiResponse>`,
    );
    expect(envelopeStatus(root)).toBe("ERROR");
    expect(findAll(root, "Error")).toHaveLength(2);
    expect(extractApiError(root).number).toBe("2019166");
  });

  it("parses a premium check result", () => {
    const root = parseNamecheap(
      `<ApiResponse Status="OK"><DomainCheckResult Domain="p.com" Available="true" ` +
        `IsPremiumName="true" PremiumRegistrationPrice="4200.00"/></ApiResponse>`,
    );
    const d = findFirst(root, "DomainCheckResult")!;
    expect(d.attrs.get("IsPremiumName")).toBe("true");
    expect(decimalToMinor(d.attrs.get("PremiumRegistrationPrice")!)).toBe(420000);
  });

  it("parses a non-real-time create result", () => {
    const root = parseNamecheap(
      `<ApiResponse Status="OK"><DomainCreateResult Domain="a.com" Registered="false" NonRealTimeDomain="true" OrderID="o1"/></ApiResponse>`,
    );
    const r = findFirst(root, "DomainCreateResult")!;
    expect(r.attrs.get("NonRealTimeDomain")).toBe("true");
  });

  it("returns [] for unknown response elements (handled gracefully)", () => {
    const root = parseNamecheap(`<ApiResponse Status="OK"><Surprise Foo="1"/></ApiResponse>`);
    expect(findAll(root, "DomainCheckResult")).toEqual([]);
  });
});

describe("parseNamecheap — hostile / malformed input is rejected (never definitive)", () => {
  it("rejects a DOCTYPE declaration", () => {
    expect(() =>
      parseNamecheap(`<!DOCTYPE x><ApiResponse Status="OK"/>`),
    ).toThrow(NamecheapParseError);
  });
  it("rejects an ENTITY declaration (XXE attempt)", () => {
    expect(() =>
      parseNamecheap(
        `<!DOCTYPE t [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]><ApiResponse>&xxe;</ApiResponse>`,
      ),
    ).toThrow(NamecheapParseError);
  });
  it("rejects an unknown/custom entity in content", () => {
    expect(() =>
      parseNamecheap(`<ApiResponse Status="OK"><X V="&custom;"/></ApiResponse>`),
    ).toThrow(NamecheapParseError);
  });
  it("rejects duplicate attributes", () => {
    expect(() =>
      parseNamecheap(`<ApiResponse Status="OK"><X A="1" A="2"/></ApiResponse>`),
    ).toThrow(/Duplicate attribute/);
  });
  it("rejects nesting that is too deep", () => {
    const deep = "<a>".repeat(40) + "</a>".repeat(40);
    expect(() => parseNamecheap(`<ApiResponse Status="OK">${deep}</ApiResponse>`)).toThrow();
  });
  it("rejects an oversized body", () => {
    expect(() => parseNamecheap("<A>" + "x".repeat(1_000_001) + "</A>")).toThrow();
  });
  it("rejects a truncated tag", () => {
    expect(() => parseNamecheap(`<ApiResponse Status="OK"><Foo`)).toThrow();
  });
  it("rejects an unclosed element", () => {
    expect(() => parseNamecheap(`<ApiResponse Status="OK"><Foo>`)).toThrow();
  });
  it("rejects a stray processing instruction", () => {
    expect(() =>
      parseNamecheap(`<ApiResponse Status="OK"><?php evil ?></ApiResponse>`),
    ).toThrow();
  });
});

describe("sanitizeText", () => {
  it("strips newlines + non-printables + bounds length", () => {
    expect(sanitizeText("a\nb\tc")).toBe("a b c");
    expect(sanitizeText("x".repeat(500)).length).toBe(200);
  });
});

describe("classifyTransportError", () => {
  it("pre-acceptance for DNS/refused/TLS", () => {
    expect(classifyTransportError({ code: "ENOTFOUND" })).toBe(
      "transport_failure_pre_acceptance",
    );
    expect(classifyTransportError(new Error("self signed certificate"))).toBe(
      "transport_failure_pre_acceptance",
    );
  });
  it("ambiguous for reset/timeout/unknown", () => {
    expect(classifyTransportError({ code: "ECONNRESET" })).toBe("ambiguous_unknown");
    expect(classifyTransportError(new Error("weird"))).toBe("ambiguous_unknown");
  });
});
