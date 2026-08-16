/**
 * Versioned keyring for domain registrant-PII encryption and blind indexing.
 *
 * Keys are loaded ONLY from protected environment configuration (or, later, an
 * external key manager). Keys are NEVER stored in PostgreSQL, source, Git, logs,
 * tests, fixtures, DB backups, or API responses. This module holds key material
 * in memory only and exposes it solely to the cipher/blind-index that need it.
 *
 * Env contract (values are 32-byte keys, base64 or hex; names only in code):
 *   DOMAIN_CONTACT_ENC_KEY_V1, DOMAIN_CONTACT_ENC_KEY_V2, ...   (AES-256-GCM)
 *   DOMAIN_CONTACT_ENC_ACTIVE_VERSION = "1"                     (active write ver)
 *   DOMAIN_BLIND_INDEX_KEY_V1, ...                              (HMAC, separate!)
 *   DOMAIN_BLIND_INDEX_ACTIVE_VERSION = "1"
 *
 * The active version is used for all new writes; older versions are decrypt-only.
 * An unknown key version fails closed (throws) — never silently skipped.
 */

export class KeyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyConfigError";
  }
}

export class UnknownKeyVersionError extends Error {
  constructor(readonly version: number) {
    super(`Unknown key version ${version} (fail closed).`);
    this.name = "UnknownKeyVersionError";
  }
}

/** Decodes a 32-byte key from base64 or hex; rejects any other length. */
function decodeKey(raw: string, label: string): Buffer {
  const s = raw.trim();
  let buf: Buffer | undefined;
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    buf = Buffer.from(s, "hex");
  } else {
    try {
      buf = Buffer.from(s, "base64");
    } catch {
      buf = undefined;
    }
  }
  if (!buf || buf.length !== 32) {
    throw new KeyConfigError(`${label} must decode to exactly 32 bytes.`);
  }
  return buf;
}

export interface KeyringInput {
  /** version number -> raw key string */
  encKeys: Record<number, string>;
  encActiveVersion: number;
  blindKeys: Record<number, string>;
  blindActiveVersion: number;
}

export class Keyring {
  private readonly enc = new Map<number, Buffer>();
  private readonly blind = new Map<number, Buffer>();
  readonly encActiveVersion: number;
  readonly blindActiveVersion: number;

  constructor(input: KeyringInput) {
    for (const [v, raw] of Object.entries(input.encKeys)) {
      this.enc.set(Number(v), decodeKey(raw, `enc key v${v}`));
    }
    for (const [v, raw] of Object.entries(input.blindKeys)) {
      this.blind.set(Number(v), decodeKey(raw, `blind key v${v}`));
    }
    if (!this.enc.has(input.encActiveVersion)) {
      throw new KeyConfigError("Active encryption key version is not present.");
    }
    if (!this.blind.has(input.blindActiveVersion)) {
      throw new KeyConfigError("Active blind-index key version is not present.");
    }
    this.encActiveVersion = input.encActiveVersion;
    this.blindActiveVersion = input.blindActiveVersion;
  }

  encKey(version: number): Buffer {
    const k = this.enc.get(version);
    if (!k) throw new UnknownKeyVersionError(version);
    return k;
  }

  blindKey(version: number): Buffer {
    const k = this.blind.get(version);
    if (!k) throw new UnknownKeyVersionError(version);
    return k;
  }

  /** Versions present, for a rotation dry-run inventory. */
  encVersions(): number[] {
    return [...this.enc.keys()].sort((a, b) => a - b);
  }

  /** Builds a keyring from a process-env-like record, or null when unconfigured. */
  static fromEnv(env: Record<string, string | undefined>): Keyring | null {
    const encKeys = collect(env, "DOMAIN_CONTACT_ENC_KEY_V");
    const blindKeys = collect(env, "DOMAIN_BLIND_INDEX_KEY_V");
    const encActive = Number(env.DOMAIN_CONTACT_ENC_ACTIVE_VERSION);
    const blindActive = Number(env.DOMAIN_BLIND_INDEX_ACTIVE_VERSION);
    if (
      Object.keys(encKeys).length === 0 ||
      Object.keys(blindKeys).length === 0 ||
      !Number.isInteger(encActive) ||
      !Number.isInteger(blindActive)
    ) {
      // Unconfigured — fail closed by returning null; callers must handle.
      return null;
    }
    return new Keyring({
      encKeys,
      encActiveVersion: encActive,
      blindKeys,
      blindActiveVersion: blindActive,
    });
  }
}

function collect(
  env: Record<string, string | undefined>,
  prefix: string,
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v && k.startsWith(prefix)) {
      const ver = Number(k.slice(prefix.length));
      if (Number.isInteger(ver)) out[ver] = v;
    }
  }
  return out;
}
