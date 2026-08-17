import { describe, expect, it } from "vitest";

import { NamecheapRegistrarProvider } from "./NamecheapRegistrarProvider";
import { NameSiloRegistrarProvider } from "./NameSiloRegistrarProvider";
import {
  createRegistrarProvider,
  DisconnectedRegistrarProvider,
} from "./registrarFactory";
import { RegistrarModeError } from "./RegistrarProvider";

describe("createRegistrarProvider (fail-closed)", () => {
  it("defaults to disconnected when mode is unset", async () => {
    const p = createRegistrarProvider({});
    expect(p).toBeInstanceOf(DisconnectedRegistrarProvider);
    expect(p.mode).toBe("disabled");
    await expect(p.checkAvailability(["a.com"])).rejects.toBeInstanceOf(
      RegistrarModeError,
    );
  });

  it("stays disconnected in sandbox mode when credentials are missing", () => {
    const p = createRegistrarProvider({
      DOMAIN_REGISTRAR_MODE: "namecheap_sandbox",
      NAMECHEAP_SANDBOX_API_USER: "u",
      // missing key/username/ip
    });
    expect(p).toBeInstanceOf(DisconnectedRegistrarProvider);
  });

  it("builds a Namecheap sandbox provider when all sandbox creds present", () => {
    const p = createRegistrarProvider({
      DOMAIN_REGISTRAR_MODE: "namecheap_sandbox",
      NAMECHEAP_SANDBOX_API_USER: "u",
      NAMECHEAP_SANDBOX_USERNAME: "u",
      NAMECHEAP_SANDBOX_API_KEY: "k",
      NAMECHEAP_SANDBOX_CLIENT_IP: "1.2.3.4",
    });
    expect(p).toBeInstanceOf(NamecheapRegistrarProvider);
    expect(p.mode).toBe("namecheap_sandbox");
  });

  it("disconnected capability matrix claims nothing", () => {
    const caps = new DisconnectedRegistrarProvider().capabilities();
    expect(caps.registration.status).toBe("unknown");
    expect(caps.registration.evidence).toBe("none");
  });

  it("builds a NameSilo sandbox provider (launch provider) when the key is present", () => {
    const p = createRegistrarProvider({
      DOMAIN_REGISTRAR_MODE: "namesilo_sandbox",
      NAMESILO_SANDBOX_API_KEY: "k",
    });
    expect(p).toBeInstanceOf(NameSiloRegistrarProvider);
    expect(p.mode).toBe("namesilo_sandbox");
  });

  it("stays disconnected in NameSilo mode when the key is missing (fail closed)", () => {
    const p = createRegistrarProvider({ DOMAIN_REGISTRAR_MODE: "namesilo_sandbox" });
    expect(p).toBeInstanceOf(DisconnectedRegistrarProvider);
  });
});
