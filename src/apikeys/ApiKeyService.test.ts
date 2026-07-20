import {
  describe,
  expect,
  it,
} from "vitest";

import { ApiKeyService } from "./ApiKeyService";

describe("ApiKeyService", () => {
  it("issues a key with a visible prefix and returns the raw key once", () => {
    const service = new ApiKeyService();

    const created = service.createKey({
      name: "SaaS Surface",
    });

    expect(
      created.key.startsWith("fhk_"),
    ).toBe(true);
    expect(created.apiKey.prefix).toBe(
      created.key.slice(0, 12),
    );
    // The stored summary never carries the hash or the raw key.
    expect(
      (created.apiKey as Record<string, unknown>)
        .keyHash,
    ).toBeUndefined();
  });

  it("verifies a valid key and records its brand", () => {
    const service = new ApiKeyService();

    const created = service.createKey({
      name: "Elite",
      brandId: "brand-1",
    });

    const record = service.verify(
      created.key,
    );

    expect(record?.brandId).toBe(
      "brand-1",
    );
  });

  it("rejects a wrong, malformed, or missing key", () => {
    const service = new ApiKeyService();

    service.createKey({ name: "Key" });

    expect(
      service.verify("fhk_wrong"),
    ).toBeUndefined();
    expect(
      service.verify("not-a-key"),
    ).toBeUndefined();
    expect(
      service.verify(undefined),
    ).toBeUndefined();
  });

  it("stops verifying a deleted key", () => {
    const service = new ApiKeyService();

    const created = service.createKey({
      name: "Key",
    });

    expect(
      service.verify(created.key),
    ).toBeTruthy();

    service.delete(created.apiKey.id);

    expect(
      service.verify(created.key),
    ).toBeUndefined();
  });
});
