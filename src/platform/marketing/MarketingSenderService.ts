import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";

/**
 * Per-tenant marketing sender configuration + safe sender-identity resolution.
 *
 * Domain safety: a tenant may NOT send from an arbitrary address. A visible
 * From ADDRESS is honored only when its domain is platform-approved for SMTP
 * sending (`sendingDomainApproved`). Otherwise a platform-controlled From on an
 * authenticated AEC domain is used, carrying the tenant's business name, with
 * the tenant's validated address as Reply-To. Website/custom-domain ownership is
 * NOT email-sending approval (SPF/DKIM/DMARC/SMTP authorization are separate).
 * Resolution FAILS CLOSED if an authorized identity can't be established.
 */
export interface MarketingSenderConfig {
  organizationId: string;
  businessName: string | null;
  fromAddress: string | null;
  sendingDomainApproved: boolean;
  replyTo: string | null;
  physicalAddress: string | null;
  status: "incomplete" | "ready";
  updatedBy: string | null;
  updatedAt: string;
}

export interface SetSenderInput {
  businessName?: string;
  fromAddress?: string;
  replyTo?: string;
  physicalAddress?: string;
  /** Platform-set; a tenant cannot self-approve its sending domain. */
  sendingDomainApproved?: boolean;
}

/** A fully-resolved, safe sender identity ready to stamp on a message. */
export interface ResolvedSender {
  fromName: string;
  fromAddress: string;
  replyTo: string;
  physicalAddress: string;
  /** True when the visible From is the platform fallback, not the tenant's. */
  usingPlatformFallback: boolean;
}

export type SenderResolution =
  | { ok: true; sender: ResolvedSender }
  | {
      ok: false;
      /** Compact, non-PII owner/admin action item. */
      reason:
        | "missing_business_name"
        | "missing_physical_address"
        | "missing_reply_to"
        | "invalid_config";
    };

export class MarketingSenderValidationError extends Error {}

const MAX_NAME = 120;
const MAX_ADDR = 254;
const MAX_PHYSICAL = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reject CR/LF/NUL/other control chars (header-injection safe) + length. */
function clean(
  value: string | undefined,
  field: string,
  max: number,
): string | undefined {
  if (value === undefined) return undefined;
  const v = value.trim();
  if (v === "") return undefined;
  if (Array.from(v).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) {
    throw new MarketingSenderValidationError(
      `${field} contains an illegal control character.`,
    );
  }
  if (v.length > max) {
    throw new MarketingSenderValidationError(`${field} is too long.`);
  }
  return v;
}

function cleanEmail(
  value: string | undefined,
  field: string,
): string | undefined {
  const v = clean(value, field, MAX_ADDR);
  if (v === undefined) return undefined;
  if (!EMAIL_RE.test(v)) {
    throw new MarketingSenderValidationError(`${field} is not a valid address.`);
  }
  return v.toLowerCase();
}

interface Row {
  organization_id: string;
  business_name: string | null;
  from_address: string | null;
  sending_domain_approved: boolean;
  reply_to: string | null;
  physical_address: string | null;
  status: string;
  updated_by: string | null;
  updated_at: string;
}

export class MarketingSenderRepository extends TenantScopedRepository {
  private readonly memory = new Map<string, MarketingSenderConfig>();

  async get(): Promise<MarketingSenderConfig | undefined> {
    const org = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        "SELECT * FROM marketing_sender_config WHERE organization_id=$1",
        [org],
      );
      const row = r.rows[0] as unknown as Row | undefined;
      return row ? mapRow(row) : undefined;
    }
    return this.memory.get(org);
  }

  async upsert(cfg: MarketingSenderConfig): Promise<void> {
    const org = this.tenantId();
    if (this.db) {
      await this.db.query(
        `INSERT INTO marketing_sender_config
           (organization_id, business_name, from_address, sending_domain_approved,
            reply_to, physical_address, status, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (organization_id) DO UPDATE SET
            business_name=$2, from_address=$3, sending_domain_approved=$4,
            reply_to=$5, physical_address=$6, status=$7, updated_by=$8,
            updated_at=$9`,
        [
          org, cfg.businessName, cfg.fromAddress,
          cfg.sendingDomainApproved, cfg.replyTo, cfg.physicalAddress,
          cfg.status, cfg.updatedBy, cfg.updatedAt,
        ],
      );
      return;
    }
    this.memory.set(org, { ...cfg, organizationId: org });
  }
}

function mapRow(row: Row): MarketingSenderConfig {
  return {
    organizationId: row.organization_id,
    businessName: row.business_name,
    fromAddress: row.from_address,
    sendingDomainApproved: Boolean(row.sending_domain_approved),
    replyTo: row.reply_to,
    physicalAddress: row.physical_address,
    status: row.status === "ready" ? "ready" : "incomplete",
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export class MarketingSenderService {
  constructor(
    private readonly repo = new MarketingSenderRepository(),
    /** The authenticated platform sending address (bounce/return-path + fallback From). */
    private readonly platformFromAddress = "no-reply@allelitecloud.com",
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async get(): Promise<MarketingSenderConfig | undefined> {
    return this.repo.get();
  }

  /**
   * Validate + persist sender config (owner/admin authorization is enforced at
   * the route). Throws MarketingSenderValidationError on unsafe/invalid values.
   * Returns the changed field names + resulting status ONLY (for audit — never
   * the address/physical text).
   */
  async set(
    input: SetSenderInput,
    actor: string,
  ): Promise<{ changedFields: string[]; status: string }> {
    const existing = await this.repo.get();
    const businessName =
      clean(input.businessName, "business name", MAX_NAME) ??
      existing?.businessName ??
      null;
    const fromAddress =
      input.fromAddress !== undefined
        ? cleanEmail(input.fromAddress, "from address") ?? null
        : existing?.fromAddress ?? null;
    const replyTo =
      input.replyTo !== undefined
        ? cleanEmail(input.replyTo, "reply-to") ?? null
        : existing?.replyTo ?? null;
    const physicalAddress =
      clean(input.physicalAddress, "physical address", MAX_PHYSICAL) ??
      existing?.physicalAddress ??
      null;
    const sendingDomainApproved =
      input.sendingDomainApproved ?? existing?.sendingDomainApproved ?? false;

    const ready = Boolean(businessName && physicalAddress && replyTo);
    const cfg: MarketingSenderConfig = {
      // organization_id is set by the tenant-scoped repo from AsyncLocalStorage.
      organizationId: existing?.organizationId ?? "",
      businessName,
      fromAddress,
      sendingDomainApproved,
      replyTo,
      physicalAddress,
      status: ready ? "ready" : "incomplete",
      updatedBy: actor,
      updatedAt: this.now(),
    };
    await this.repo.upsert(cfg);

    const changedFields: string[] = [];
    for (const f of [
      "businessName",
      "fromAddress",
      "replyTo",
      "physicalAddress",
      "sendingDomainApproved",
    ] as const) {
      if (input[f as keyof SetSenderInput] !== undefined) changedFields.push(f);
    }
    return { changedFields, status: cfg.status };
  }

  /**
   * Resolve a safe sender identity. Fail-closed when the required identity or
   * physical address is missing. Uses the platform fallback From (authenticated
   * AEC domain) unless the tenant's own From domain is platform-approved.
   */
  async resolve(): Promise<SenderResolution> {
    const cfg = await this.repo.get();
    if (!cfg || !cfg.businessName) {
      return { ok: false, reason: "missing_business_name" };
    }
    if (!cfg.physicalAddress) {
      return { ok: false, reason: "missing_physical_address" };
    }
    if (!cfg.replyTo) {
      return { ok: false, reason: "missing_reply_to" };
    }
    const useOwn =
      cfg.sendingDomainApproved &&
      !!cfg.fromAddress &&
      EMAIL_RE.test(cfg.fromAddress);
    return {
      ok: true,
      sender: {
        fromName: cfg.businessName,
        fromAddress: useOwn ? cfg.fromAddress! : this.platformFromAddress,
        replyTo: cfg.replyTo,
        physicalAddress: cfg.physicalAddress,
        usingPlatformFallback: !useOwn,
      },
    };
  }
}
